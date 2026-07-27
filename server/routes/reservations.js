const express = require('express');
const { query } = require('../db');
const {
  rowToReservation,
  toTimestamps,
  generateConfirmationCode,
} = require('../lib/reservationShape');

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

    res.json(result.rows.map(rowToReservation));
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

// POST /api/reservations
router.post('/', async (req, res, next) => {
  try {
    const { userId, email, deskId, date, startMin, endMin } = req.body;

    if ((!userId && !email) || !deskId || !date || startMin == null || endMin == null) {
      return res.status(400).json({
        message: 'deskId, date, startMin, endMin and either userId or email are required',
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

    const inserted = await query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING reservation_id`,
      [resolvedUserId, deskId, startsAt, endsAt, generateConfirmationCode()]
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
