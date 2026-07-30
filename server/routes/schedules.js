const express = require('express');
const { query } = require('../db');
const { requireAdmin } = require('../lib/auth');
const { toDateString } = require('../lib/reservationShape');

const router = express.Router();

// Standing arrangements, not bookings. Administrative throughout.
router.use(requireAdmin);

const DAY_LABELS = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};

const minutesFrom = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// A schedule's state is not a tense.
//
// The Reservations tab filters bookings by upcoming or past, which cannot
// describe an arrangement running from August to October — that is neither, it
// is active. These are the states a schedule is actually in, three of them
// derived from its dates rather than stored.
function scheduleState(row, today) {
  if (row.status === 'pending') return 'pending';
  if (row.status === 'canceled') return 'canceled';
  if (row.status === 'denied') return 'denied';
  if (row.active_from && toDateString(row.active_from) > today) return 'upcoming';
  if (row.active_until && toDateString(row.active_until) < today) return 'ended';
  return 'active';
}

// GET /api/schedules
//
// One entry per arrangement. A Mon/Wed/Fri pattern is three rows sharing a
// series_id, so grouping on schedule_id alone would list it three times.
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.series_id,
              array_agg(s.schedule_id ORDER BY s.day_of_week) AS schedule_ids,
              u.first_name, u.last_name, u.email,
              d.desk_number,
              min(s.status)      AS status,
              min(s.active_from) AS active_from,
              max(s.active_until) AS active_until,
              bool_or(s.active_until IS NULL) AS open_ended,
              min(s.created_at)  AS created_at,
              max(s.decided_at)  AS decided_at,
              max(dec.first_name || ' ' || dec.last_name) AS decided_by,
              array_agg(s.day_of_week ORDER BY s.day_of_week)      AS days,
              array_agg(s.start_time::text ORDER BY s.day_of_week) AS start_times,
              array_agg(s.end_time::text ORDER BY s.day_of_week)   AS end_times,

              -- Counted from the rows themselves rather than trusted to a stored
              -- total, so a cancelled or edited occurrence is reflected.
              (SELECT count(*)::int FROM reservations r
                WHERE r.schedule_id = ANY(array_agg(s.schedule_id))
                  AND r.status IN ('pending', 'approved')) AS bookings,
              (SELECT count(*)::int FROM reservations r
                WHERE r.schedule_id = ANY(array_agg(s.schedule_id))
                  AND r.status IN ('pending', 'approved')
                  AND r.ends_at >= now()) AS bookings_remaining,

              -- How far occurrences were actually generated. For an open-ended
              -- schedule this is the date its bookings stop, which is the one
              -- fact nothing in the interface has been able to say.
              (SELECT max(r.starts_at)::date FROM reservations r
                WHERE r.schedule_id = ANY(array_agg(s.schedule_id))
                  AND r.status IN ('pending', 'approved')) AS generated_through,

              -- Occurrences the exclusion constraint refused because the desk was
              -- taken. Reported once when the schedule was requested and then only
              -- recoverable from the audit trail.
              (SELECT (l.metadata->>'skipped')::int
                 FROM logs l
                 JOIN activities a ON a.activity_id = l.activity_id
                WHERE a.activity_type = 'schedule_requested'
                  AND l.schedule_id = ANY(array_agg(s.schedule_id))
                ORDER BY l.occurred_at LIMIT 1) AS skipped

         FROM recurring_schedules s
         JOIN users u   ON u.user_id = s.user_id
         LEFT JOIN desks d ON d.desk_id = s.desk_id
         LEFT JOIN users dec ON dec.user_id = s.decided_by_user_id
        GROUP BY s.series_id, u.user_id, u.first_name, u.last_name, u.email, d.desk_number
        ORDER BY min(s.created_at) DESC`
    );

    const today = toDateString(new Date());

    res.json(
      result.rows.map((row) => ({
        id: String(row.series_id),
        scheduleIds: row.schedule_ids,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        deskNumber: row.desk_number,
        state: scheduleState(row, today),
        activeFrom: row.active_from ? toDateString(row.active_from) : null,
        activeUntil: row.open_ended || !row.active_until ? null : toDateString(row.active_until),
        openEnded: row.open_ended,
        generatedThrough: row.generated_through ? toDateString(row.generated_through) : null,
        bookings: row.bookings,
        bookingsRemaining: row.bookings_remaining,
        skipped: row.skipped ?? 0,
        decidedBy: row.decided_by,
        decidedAt: row.decided_at,
        pattern: row.days.map((day, i) => ({
          day: DAY_LABELS[day],
          dayNumber: day,
          startMin: minutesFrom(row.start_times[i]),
          endMin: minutesFrom(row.end_times[i]),
        })),
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
