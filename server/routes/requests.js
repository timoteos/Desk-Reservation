const express = require('express');
const { pool, query } = require('../db');
const { expirePending } = require('../lib/expirePending');
const { toTimestamps, generateConfirmationCode } = require('../lib/reservationShape');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();

// The whole approval queue is administrative — nothing here is public.
router.use(requireAdmin);

const DAY_LABELS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

const minutesFrom = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// GET /api/requests — everything awaiting a decision, both kinds in one queue.
//
// A recurring request is one item covering many bookings, not many items: a
// weekly pattern would otherwise need ~39 separate approvals.
router.get('/', async (req, res, next) => {
  try {
    await expirePending();

    const oneOff = await query(
      `SELECT r.reservation_id, r.starts_at, r.ends_at, r.expires_at,
              r.confirmation_code, d.desk_number,
              u.first_name, u.last_name, u.email, ro.role_type
         FROM reservations r
         JOIN users u  ON u.user_id = r.user_id
         JOIN roles ro ON ro.role_id = u.role_id
         JOIN desks d  ON d.desk_id = r.desk_id
        WHERE r.status = 'pending' AND r.schedule_id IS NULL
        ORDER BY r.starts_at`
    );

    // Grouped by request: the rows a single submission created share a user,
    // desk and creation time, so they collapse into one queue entry.
    const recurring = await query(
      `SELECT min(s.schedule_id) AS group_id,
              u.first_name, u.last_name, u.email, ro.role_type,
              d.desk_number,
              min(s.expires_at) AS expires_at,
              array_agg(s.schedule_id ORDER BY s.day_of_week) AS schedule_ids,
              array_agg(s.day_of_week ORDER BY s.day_of_week) AS days,
              array_agg(s.start_time::text ORDER BY s.day_of_week) AS start_times,
              array_agg(s.end_time::text ORDER BY s.day_of_week) AS end_times,
              (SELECT count(*)::int FROM reservations r
                WHERE r.schedule_id = ANY(array_agg(s.schedule_id))
                  AND r.status = 'pending') AS booking_count
         FROM recurring_schedules s
         JOIN users u  ON u.user_id = s.user_id
         JOIN roles ro ON ro.role_id = u.role_id
         LEFT JOIN desks d ON d.desk_id = s.desk_id
        WHERE s.status = 'pending'
        GROUP BY u.user_id, u.first_name, u.last_name, u.email, ro.role_type,
                 d.desk_number, date_trunc('second', s.created_at)
        ORDER BY min(s.created_at)`
    );

    res.json([
      ...oneOff.rows.map((row) => ({
        kind: 'one-off',
        id: String(row.reservation_id),
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role_type,
        deskNumber: row.desk_number,
        date: row.starts_at.toISOString().split('T')[0],
        startMin: row.starts_at.getHours() * 60 + row.starts_at.getMinutes(),
        endMin: row.ends_at.getHours() * 60 + row.ends_at.getMinutes(),
        confirmationCode: row.confirmation_code,
        expiresAt: row.expires_at,
      })),
      ...recurring.rows.map((row) => ({
        kind: 'recurring',
        id: String(row.group_id),
        scheduleIds: row.schedule_ids,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role_type,
        deskNumber: row.desk_number,
        bookingCount: row.booking_count,
        pattern: row.days.map((day, i) => ({
          day: DAY_LABELS[day],
          startMin: minutesFrom(row.start_times[i]),
          endMin: minutesFrom(row.end_times[i]),
        })),
        expiresAt: row.expires_at,
      })),
    ]);
  } catch (err) {
    next(err);
  }
});

// The acting admin comes from the verified token. A client-supplied email is
// not trusted for attribution — anyone could claim to be anyone.
const resolveDecider = (req) => req.user?.sub ?? null;

// POST /api/requests/book   { userId, deskId?, date, startMin, endMin }
//
// An admin booking, for themselves or on someone's behalf. Created approved
// rather than pending: the admin is the approver, so routing it through their
// own queue would be theatre. Recorded as decided by them for the audit trail.
router.post('/book', async (req, res, next) => {
  try {
    const { userId, deskId, date, startMin, endMin } = req.body;

    if (!userId || !date || startMin == null || endMin == null) {
      return res.status(400).json({
        message: 'userId, date, startMin and endMin are required',
      });
    }

    const { startsAt, endsAt } = toTimestamps(date, startMin, endMin);

    if (endsAt <= startsAt) {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }
    if (startsAt <= new Date()) {
      return res.status(400).json({ message: 'That time has already passed. Pick a later slot.' });
    }

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
          ORDER BY random() LIMIT 1`,
        [startsAt, endsAt]
      );
      if (rows.length === 0) {
        return res.status(409).json({
          message: 'Every desk is booked for that time. Try a different slot.',
        });
      }
      resolvedDeskId = rows[0].desk_id;
    }

    const { rows } = await query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code,
          status, decided_by_user_id, decided_at)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, now())
       RETURNING reservation_id, confirmation_code`,
      [userId, resolvedDeskId, startsAt, endsAt, generateConfirmationCode(), resolveDecider(req)]
    );

    const deskRow = await query('SELECT desk_number FROM desks WHERE desk_id = $1', [resolvedDeskId]);

    res.status(201).json({
      id: String(rows[0].reservation_id),
      confirmationCode: rows[0].confirmation_code,
      deskNumber: deskRow.rows[0].desk_number,
      status: 'approved',
    });
  } catch (err) {
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'That desk is already reserved for part of this time range.',
      });
    }
    next(err);
  }
});

// PATCH /api/requests/reservations/:id/cancel
//
// The administrative override: cancel any live booking without needing the
// holder's confirmation code. Recorded against the admin who did it.
router.patch('/reservations/:id/cancel', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE reservations
          SET status = 'canceled', expires_at = NULL,
              decided_by_user_id = $2, decided_at = now()
        WHERE reservation_id = $1
          AND status IN ('pending', 'approved')
          AND ends_at > now()
        RETURNING reservation_id`,
      [req.params.id, resolveDecider(req)]
    );

    if (rows.length === 0) {
      return res.status(409).json({
        message: 'That reservation can no longer be canceled — it may already be canceled, or it has ended.',
      });
    }
    res.json({ id: String(rows[0].reservation_id), status: 'canceled' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/one-off/:id   { decision }
router.patch('/one-off/:id', async (req, res, next) => {
  try {
    const { decision } = req.body;
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'denied'" });
    }

    const deciderId = resolveDecider(req);

    const { rows } = await query(
      `UPDATE reservations
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE reservation_id = $2 AND status = 'pending'
        RETURNING reservation_id`,
      [decision, req.params.id, deciderId]
    );

    if (rows.length === 0) {
      return res.status(409).json({
        message: 'That request is no longer pending — it may have expired or been decided already.',
      });
    }
    res.json({ id: String(rows[0].reservation_id), status: decision });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/recurring/:id  { decision: 'approved' | 'denied' }
// One decision covers the whole pattern and every booking it generated.
router.patch('/recurring/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { decision } = req.body;
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'denied'" });
    }

    const deciderId = resolveDecider(req);

    await client.query('BEGIN');

    // The queue groups schedules by submission, so approving one member of a
    // group has to carry its siblings — same user, desk and creation second.
    const { rows: group } = await client.query(
      `SELECT s2.schedule_id
         FROM recurring_schedules s1
         JOIN recurring_schedules s2
           ON s2.user_id = s1.user_id
          AND s2.desk_id IS NOT DISTINCT FROM s1.desk_id
          AND date_trunc('second', s2.created_at) = date_trunc('second', s1.created_at)
        WHERE s1.schedule_id = $1 AND s2.status = 'pending'`,
      [req.params.id]
    );

    if (group.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'That request is no longer pending — it may have expired or been decided already.',
      });
    }

    const ids = group.map((r) => r.schedule_id);

    await client.query(
      `UPDATE recurring_schedules
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE schedule_id = ANY($2::int[])`,
      [decision, ids, deciderId]
    );

    const { rowCount } = await client.query(
      `UPDATE reservations
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE schedule_id = ANY($2::int[]) AND status = 'pending'`,
      [decision, ids, deciderId]
    );

    await client.query('COMMIT');
    res.json({ id: req.params.id, status: decision, bookingsUpdated: rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
