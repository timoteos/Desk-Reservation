const express = require('express');
const { pool, query } = require('../db');
const { requireAdmin } = require('../lib/auth');
const { toDateString, generateConfirmationCode } = require('../lib/reservationShape');
const { recordActivity } = require('../lib/activityLog');
const {
  DAY_NUMBERS,
  minutesToTime,
  planPattern,
  deskAvailability,
} = require('../lib/recurringPattern');

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
  if (!row.days || row.days.length === 0) return 'canceled';
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
              -- The desk comes from the live rows, and the query does not group by
              -- it. It used to: every row in a series shared a desk, so grouping on
              -- it was harmless — until an edit could move the live rows while the
              -- rows it cancelled kept the old desk, which split one arrangement
              -- into two entries, one of them a phantom reading "canceled, Desk# 11".
              -- coalesce so an ended or cancelled arrangement, which has no live
              -- rows left, still says which desk it held.
              coalesce(min(d.desk_number) FILTER (WHERE s.status <> 'canceled'),
                       min(d.desk_number))                 AS desk_number,
              coalesce(min(d.desk_id) FILTER (WHERE s.status <> 'canceled'),
                       min(d.desk_id))                     AS desk_id,
              -- Cancelled rows are excluded here for the same reason as below: a
              -- weekday dropped by an edit is a cancelled row, and letting it into
              -- min() would report the whole arrangement as cancelled.
              min(s.status) FILTER (WHERE s.status <> 'canceled') AS status,
              min(s.active_from) FILTER (WHERE s.status <> 'canceled') AS active_from,
              max(s.active_until) FILTER (WHERE s.status <> 'canceled') AS active_until,
              bool_or(s.active_until IS NULL) FILTER (WHERE s.status <> 'canceled') AS open_ended,
              min(s.created_at)  AS created_at,
              max(s.decided_at)  AS decided_at,
              max(dec.first_name || ' ' || dec.last_name) AS decided_by,
              -- A weekday dropped by an edit is cancelled rather than deleted,
              -- because deleting it would set its past bookings' schedule_id to
              -- null and lose the link between a served day and the arrangement
              -- that produced it. So the live pattern is the rows still standing.
              array_agg(s.day_of_week ORDER BY s.day_of_week)
                FILTER (WHERE s.status <> 'canceled')      AS days,
              array_agg(s.start_time::text ORDER BY s.day_of_week)
                FILTER (WHERE s.status <> 'canceled')      AS start_times,
              array_agg(s.end_time::text ORDER BY s.day_of_week)
                FILTER (WHERE s.status <> 'canceled')      AS end_times,

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
        GROUP BY s.series_id, u.user_id, u.first_name, u.last_name, u.email
        ORDER BY min(s.created_at) DESC`
    );

    const today = toDateString(new Date());

    res.json(
      result.rows.map((row) => ({
        id: String(row.series_id),
        scheduleIds: row.schedule_ids,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        deskId: row.desk_id,
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
        // A fully cancelled series has no live rows, so the aggregates come back
        // null rather than empty.
        pattern: (row.days ?? []).map((day, i) => ({
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


// PATCH /api/schedules/:seriesId
// { deskId?, days?, activeUntil? }
//
// Changes a live arrangement: which desk, which weekdays and hours, and how long
// it runs. Whatever is omitted stays as it is.
//
// Occurrences already served are history and are never touched. Everything from
// today onward is cancelled and regenerated from the new pattern, inside one
// transaction, so a rejected edit leaves the schedule exactly as it was rather
// than half-moved.
//
// The all-or-nothing rule applies here too: an edit that cannot cover every one
// of its days is refused, because the whole point is that the desk belongs to the
// holder for the duration.
router.patch('/:seriesId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { deskId, days, activeUntil } = req.body || {};
    if (deskId == null && !days && activeUntil === undefined) {
      return res.status(400).json({ message: 'Nothing to change.' });
    }

    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT s.schedule_id, s.user_id, s.desk_id, s.day_of_week, s.status,
              s.start_time::text AS start_time, s.end_time::text AS end_time,
              s.active_from, s.active_until, s.expires_at,
              u.first_name, u.last_name
         FROM recurring_schedules s
         JOIN users u ON u.user_id = s.user_id
        WHERE s.series_id = $1 AND s.status <> 'canceled'
        ORDER BY s.day_of_week`,
      [req.params.seriesId]
    );

    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'That schedule is no longer active — it may already have been ended.',
      });
    }

    const before = existing[0];
    const seriesId = Number(req.params.seriesId);

    // Anything not supplied keeps its current value, so a caller changing only
    // the desk does not have to restate the whole pattern.
    const nextDays = days ?? Object.fromEntries(
      existing.map((row) => [
        Object.keys(DAY_NUMBERS).find((k) => DAY_NUMBERS[k] === row.day_of_week),
        { startMin: minutesFrom(row.start_time), endMin: minutesFrom(row.end_time) },
      ])
    );
    const nextUntil = activeUntil === undefined
      ? (before.active_until ? toDateString(before.active_until) : null)
      : activeUntil;
    const nextDeskId = deskId == null ? before.desk_id : Number(deskId);

    // Regeneration starts today, never at the original start date: a schedule
    // that has been running for a month keeps the month it already served.
    const plan = planPattern({ days: nextDays, activeUntil: nextUntil });
    if (plan.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: plan.error });
    }

    // The date that gets stored is the one generation actually honoured, not the
    // one that was asked for. planPattern caps a run at a year, so writing the
    // request verbatim would record an end date months past the last booking —
    // and the Schedules tab, which warns about bookings stopping early only for
    // open-ended schedules, would show a confident span it could not deliver.
    // The create route already stores the capped value; this is the same rule.
    const storedUntil = plan.openEnded ? null : toDateString(plan.to);

    // Cancelled first, so the exclusion constraint stops counting this
    // schedule's own bookings against the desks it might move to.
    const { rowCount: released } = await client.query(
      `UPDATE reservations
          SET status = 'canceled', expires_at = NULL,
              decided_by_user_id = $2, decided_at = now()
        WHERE schedule_id IN (SELECT schedule_id FROM recurring_schedules WHERE series_id = $1)
          AND status IN ('pending', 'approved')
          AND starts_at > now()`,
      [seriesId, req.user?.sub ?? null]
    );

    const availability = await deskAvailability(client, plan.slots, {
      ignoreSeriesId: seriesId,
    });
    const target = availability.find((d) => d.deskId === nextDeskId);
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'That desk is not available — it may have been taken out of service.',
      });
    }
    if (target.conflicts > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Desk# ${target.deskNumber} is already booked on ${target.conflicts} of the `
          + `${target.occurrences} days that change would cover, and a schedule has to cover `
          + 'every day. Nothing was changed.',
      });
    }

    // Weekday rows: update the ones that stay, add the ones that appear, cancel
    // the ones that go.
    const wanted = new Map(
      Object.entries(nextDays).map(([key, t]) => [DAY_NUMBERS[key], t])
    );
    const scheduleIdByDay = new Map();

    for (const row of existing) {
      const times = wanted.get(row.day_of_week);
      if (times) {
        await client.query(
          `UPDATE recurring_schedules
              SET desk_id = $2, start_time = $3, end_time = $4, active_until = $5
            WHERE schedule_id = $1`,
          [row.schedule_id, nextDeskId, minutesToTime(times.startMin),
           minutesToTime(times.endMin), storedUntil]
        );
        scheduleIdByDay.set(row.day_of_week, row.schedule_id);
      } else {
        await client.query(
          `UPDATE recurring_schedules
              SET status = 'canceled', active_until = CURRENT_DATE,
                  decided_by_user_id = $2, decided_at = now()
            WHERE schedule_id = $1`,
          [row.schedule_id, req.user?.sub ?? null]
        );
      }
    }

    for (const [dayNumber, times] of wanted) {
      if (scheduleIdByDay.has(dayNumber)) continue;
      const { rows } = await client.query(
        `INSERT INTO recurring_schedules
           (user_id, desk_id, day_of_week, start_time, end_time, status,
            active_from, active_until, series_id, decided_by_user_id, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         RETURNING schedule_id`,
        [before.user_id, nextDeskId, dayNumber, minutesToTime(times.startMin),
         minutesToTime(times.endMin), before.status, before.active_from, storedUntil,
         seriesId, req.user?.sub ?? null]
      );
      scheduleIdByDay.set(dayNumber, rows[0].schedule_id);
    }

    // Regenerate. A collision here is a race rather than a plan — the
    // availability check just cleared this desk — so it fails the whole edit.
    for (const slot of plan.slots) {
      await client.query(
        `INSERT INTO reservations
           (user_id, desk_id, schedule_id, starts_at, ends_at, confirmation_code,
            status, expires_at, booking_source, decided_by_user_id, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'recurring', $9, now())`,
        [
          before.user_id, nextDeskId, scheduleIdByDay.get(slot.dayNumber),
          slot.startsAt, slot.endsAt, generateConfirmationCode(),
          before.status, before.status === 'pending' ? before.expires_at : null,
          req.user?.sub ?? null,
        ]
      );
    }

    const changes = {};
    if (nextDeskId !== before.desk_id) {
      changes.desk = { from: before.desk_id, to: nextDeskId };
    }
    if (days) changes.days = true;
    if (activeUntil !== undefined) {
      changes.until = {
        from: before.active_until ? toDateString(before.active_until) : null,
        to: storedUntil,
      };
    }

    await recordActivity({
      activityType: 'modified',
      scheduleId: seriesId,
      actorUserId: req.user?.sub ?? null,
      metadata: { ...changes, released, regenerated: plan.slots.length },
      description: `Edited ${before.first_name} ${before.last_name}'s schedule — `
        + `${released} booking(s) released, ${plan.slots.length} regenerated`,
    }, client);

    await client.query('COMMIT');

    res.json({
      seriesId: String(seriesId),
      deskNumber: target.deskNumber,
      released,
      regenerated: plan.slots.length,
      activeUntil: storedUntil,
      cappedAtCeiling: plan.cappedAtCeiling,
      changed: Object.keys(changes),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'One of those days was booked while the change was being made. '
          + 'Nothing was changed — try again.',
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
