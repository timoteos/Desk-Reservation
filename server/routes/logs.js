const express = require('express');
const { query } = require('../db');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();

// The audit trail is administrative.
router.use(requireAdmin);

const DEFAULT_LIMIT = 100;

// GET /api/logs?activity=approved&limit=100
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 500);
    const { activity } = req.query;

    const { rows } = await query(
      `SELECT l.log_id, l.occurred_at, l.description, l.metadata,
              a.activity_type, a.label,
              actor.first_name AS actor_first, actor.last_name AS actor_last,
              subject.first_name AS subject_first, subject.last_name AS subject_last,
              d.desk_number, coalesce(d.display_name, 'Desk# ' || d.desk_number) AS desk_label, r.starts_at, r.ends_at, r.confirmation_code
         FROM logs l
         JOIN activities a ON a.activity_id = l.activity_id
         LEFT JOIN users actor ON actor.user_id = l.actor_user_id
         LEFT JOIN reservations r ON r.reservation_id = l.reservation_id
         LEFT JOIN users subject ON subject.user_id = r.user_id
         LEFT JOIN desks d ON d.desk_id = r.desk_id
        WHERE ($1::text IS NULL OR a.activity_type = $1)
        ORDER BY l.occurred_at DESC, l.log_id DESC
        LIMIT $2`,
      [activity || null, limit]
    );

    res.json(
      rows.map((row) => ({
        id: String(row.log_id),
        occurredAt: row.occurred_at,
        activity: row.activity_type,
        label: row.label,
        // Null actor means the system acted, not that we failed to record it.
        actor: row.actor_first ? `${row.actor_first} ${row.actor_last}` : null,
        subject: row.subject_first ? `${row.subject_first} ${row.subject_last}` : null,
        deskNumber: row.desk_number,
        // The name, not just the number. Without this the log rebuilt a label
        // from the number and called Conference Room 511A "Desk# 13".
        deskLabel: row.desk_label ?? undefined,
        startMin: row.starts_at ? row.starts_at.getHours() * 60 + row.starts_at.getMinutes() : null,
        endMin: row.ends_at ? row.ends_at.getHours() * 60 + row.ends_at.getMinutes() : null,
        date: row.starts_at
          ? `${row.starts_at.getFullYear()}-${String(row.starts_at.getMonth() + 1).padStart(2, '0')}-${String(row.starts_at.getDate()).padStart(2, '0')}`
          : null,
        confirmationCode: row.confirmation_code,
        description: row.description,
        metadata: row.metadata,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/logs/activities — the filter options, from the lookup table rather
// than duplicated in the frontend.
router.get('/activities', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT activity_type, label FROM activities ORDER BY activity_id'
    );
    res.json(rows.map((r) => ({ type: r.activity_type, label: r.label })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
