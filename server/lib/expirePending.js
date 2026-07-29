const { query } = require('../db');
const { recordActivity } = require('./activityLog');

// Pending requests hold their desk — the exclusion constraint includes them —
// so an unanswered request would freeze a desk indefinitely without this.
//
// Expiry has to actually update rows rather than being computed on read: the
// constraint's predicate can't call now(), since index predicates must be
// immutable. So the sweep runs on server start and whenever availability or
// the request queue is read. Cheap (one indexed UPDATE each) and it can't
// silently stop working the way a forgotten cron job can.
async function expirePending() {
  // Schedules first: expiring a schedule should take its generated
  // reservations with it, and doing it in this order avoids a pass where the
  // schedule is expired but its bookings still look live.
  const schedules = await query(
    `UPDATE recurring_schedules
        SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= now()
      RETURNING schedule_id`
  );

  if (schedules.rowCount > 0) {
    await query(
      `UPDATE reservations
          SET status = 'expired'
        WHERE status = 'pending'
          AND schedule_id = ANY($1::int[])`,
      [schedules.rows.map((r) => r.schedule_id)]
    );
  }

  const reservations = await query(
    `UPDATE reservations
        SET status = 'expired'
      WHERE status = 'pending'
        AND schedule_id IS NULL
        AND expires_at IS NOT NULL
        AND expires_at <= now()
      RETURNING reservation_id`
  );

  // Actor stays null: the sweep is the system, not a person.
  for (const row of reservations.rows) {
    await recordActivity({
      activityType: 'expired',
      reservationId: row.reservation_id,
      description: 'Released automatically — not reviewed in time',
    });
  }
  for (const row of schedules.rows) {
    await recordActivity({
      activityType: 'expired',
      scheduleId: row.schedule_id,
      description: 'Recurring schedule released — not reviewed in time',
    });
  }

  const expired = schedules.rowCount + reservations.rowCount;
  if (expired > 0) {
    console.log(
      `Expired ${reservations.rowCount} reservation(s) and ${schedules.rowCount} schedule(s)`
    );
  }
  return { reservations: reservations.rowCount, schedules: schedules.rowCount };
}

// Normally LEAST(created + 24h, starts - 2h). For a recurring pattern,
// `startsAt` is the first occurrence — basing it on each one would kill a
// 90-day schedule as soon as its first Monday passed.
const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEAD_TIME_MS = 2 * 60 * 60 * 1000;
// A request booked close to its start time would otherwise land on an
// expires_at already behind us and be swept immediately. Give the admin a
// short window instead, bounded by the reservation itself.
const MIN_REVIEW_MS = 15 * 60 * 1000;

function expiryFor(startsAt) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();

  let expires = Math.min(now + PENDING_WINDOW_MS, start - LEAD_TIME_MS);

  if (expires < now + MIN_REVIEW_MS) {
    expires = Math.min(now + MIN_REVIEW_MS, start);
  }
  return new Date(expires);
}

module.exports = { expirePending, expiryFor };
