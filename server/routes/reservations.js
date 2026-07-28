const express = require('express');
const { query } = require('../db');
const {
  rowToReservation,
  toTimestamps,
  generateConfirmationCode,
} = require('../lib/reservationShape');
const { expirePending, expiryFor } = require('../lib/expirePending');

const router = express.Router();

const SELECT_RESERVATION = `
  SELECT r.reservation_id, r.user_id, r.desk_id, r.starts_at, r.ends_at,
         r.status, r.confirmation_code,
         u.first_name, u.last_name,
         d.desk_number
    FROM reservations r
    JOIN users u ON u.user_id = r.user_id
    JOIN desks d ON d.desk_id = r.desk_id
`;

// GET /api/reservations?date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    // Stale pending requests still hold their desk, so clear them before
    // reporting what's booked.
    await expirePending();

    const { date } = req.query;
    const result = date
      ? await query(
          `${SELECT_RESERVATION}
             WHERE r.starts_at >= $1::date
               AND r.starts_at <  $1::date + interval '1 day'
               AND r.status IN ('pending', 'approved')
             ORDER BY r.starts_at`,
          [date]
        )
      : await query(`${SELECT_RESERVATION} ORDER BY r.starts_at`);

    const reservations = result.rows.map(rowToReservation);

    // This endpoint is public because the calendar needs to know what's taken.
    // Availability only requires which desk and when — returning names and
    // confirmation codes would let anyone harvest codes and then look up other
    // people's bookings. Identifying details are for administrators.
    if (req.user?.role === 'admin') {
      return res.json(reservations);
    }

    res.json(
      reservations.map(({ id, date: d, startMin: s, endMin: e, deskNumber, deskId }) => ({
        id,
        date: d,
        startMin: s,
        endMin: e,
        deskNumber,
        deskId,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/reservations/code/:code
router.get('/code/:code', async (req, res, next) => {
  try {
    const result = await query(
      `${SELECT_RESERVATION} WHERE r.confirmation_code = $1`,
      [req.params.code.trim().toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }
    res.json(rowToReservation(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reservations/code/:code/cancel
//
// The confirmation code is the credential, as with an airline booking
// reference. Codes are random 8-character strings, so they aren't guessable.
router.patch('/code/:code/cancel', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE reservations
          SET status = 'canceled', expires_at = NULL
        WHERE confirmation_code = $1
          AND status IN ('pending', 'approved')
          AND ends_at > now()
        RETURNING reservation_id`,
      [req.params.code.trim().toUpperCase()]
    );

    if (rows.length === 0) {
      // Either no such code, already decided, or the booking has finished.
      // Reported together so the endpoint can't confirm a code exists.
      return res.status(409).json({
        message: 'That reservation can no longer be canceled. It may already be canceled, or it has ended.',
      });
    }

    res.json({ status: 'canceled' });
  } catch (err) {
    next(err);
  }
});

// POST /api/reservations
router.post('/', async (req, res, next) => {
  try {
    const { userId, email, deskId, date, startMin, endMin } = req.body;

    // deskId is optional — omitting it asks the system to assign one.
    if ((!userId && !email) || !date || startMin == null || endMin == null) {
      return res.status(400).json({
        message: 'date, startMin, endMin and either userId or email are required',
      });
    }

    // Until DHS SSO is in place, the booker identifies themselves by email.
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { rows } = await query(
        'SELECT user_id FROM users WHERE lower(email) = lower($1) AND is_active',
        [email.trim()]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          message: `No account found for ${email.trim()}. Check the address or contact your administrator.`,
        });
      }
      resolvedUserId = rows[0].user_id;
    }

    const { startsAt, endsAt } = toTimestamps(date, startMin, endMin);

    // A booking in the past would get an expires_at already behind us and be
    // swept the moment it's created, so refuse it here with a real reason
    // rather than letting it vanish silently.
    if (startsAt <= new Date()) {
      return res.status(400).json({
        message: 'That time has already passed. Pick a later slot.',
      });
    }

    // No desk chosen: pick one at random from those free for this window.
    // Random rather than lowest-numbered so bookings spread across the office
    // instead of piling onto Desk# 1.
    let resolvedDeskId = deskId;
    if (!resolvedDeskId) {
      const { rows } = await query(
        `SELECT desk_id FROM desks d
          WHERE d.is_active
            AND NOT EXISTS (
              SELECT 1 FROM reservations r
               WHERE r.desk_id = d.desk_id
                 AND r.status IN ('pending', 'approved')
                 AND tsrange(r.starts_at, r.ends_at) && tsrange($1, $2)
            )
          ORDER BY random()
          LIMIT 1`,
        [startsAt, endsAt]
      );
      if (rows.length === 0) {
        return res.status(409).json({
          message: 'Every desk is booked for that time. Try a different slot.',
        });
      }
      resolvedDeskId = rows[0].desk_id;
    }

    const inserted = await query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING reservation_id`,
      [
        resolvedUserId,
        resolvedDeskId,
        startsAt,
        endsAt,
        generateConfirmationCode(),
        expiryFor(startsAt),
      ]
    );

    const result = await query(
      `${SELECT_RESERVATION} WHERE r.reservation_id = $1`,
      [inserted.rows[0].reservation_id]
    );

    res.status(201).json(rowToReservation(result.rows[0]));
  } catch (err) {
    // The database rejects overlapping bookings outright — translate that into
    // something the UI can show rather than a 500.
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'That desk is already reserved for part of this time range.',
      });
    }
    if (err.constraint === 'ends_after_start') {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }
    next(err);
  }
});

module.exports = router;
