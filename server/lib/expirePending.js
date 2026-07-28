const { query } = require('../db');

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

  const expired = schedules.rowCount + reservations.rowCount;
  if (expired > 0) {
    console.log(
      `Expired ${reservations.rowCount} reservation(s) and ${schedules.rowCount} schedule(s)`
    );
  }
  return { reservations: reservations.rowCount, schedules: schedules.rowCount };
}

// LEAST(created + 24h, starts - 2h). For a recurring pattern, `startsAt` is the
// first occurrence — basing it on each one would kill a 90-day schedule as soon
// as its first Monday passed.
const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEAD_TIME_MS = 2 * 60 * 60 * 1000;

function expiryFor(startsAt) {
  const twentyFourHours = new Date(Date.now() + PENDING_WINDOW_MS);
  const beforeStart = new Date(new Date(startsAt).getTime() - LEAD_TIME_MS);
  return beforeStart < twentyFourHours ? beforeStart : twentyFourHours;
}

module.exports = { expirePending, expiryFor };
