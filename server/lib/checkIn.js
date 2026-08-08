// Turning up, and what happens when you don't.
//
// One module because the same three rules are needed by the front desk, by the
// cubicle tablets when they exist, and by the sweep — and a grace period that
// means one thing in one place and something else in another is the defect this
// project keeps producing.

const { pool, query } = require('../db');
const { recordActivity } = require('./activityLog');

// How early somebody can check in. Arriving at 8:45 for a nine o'clock desk is
// normal behaviour, not an error to be corrected.
const EARLY_CHECK_IN_MINUTES = 30;

// How long a desk is held for somebody who has not arrived. Bookings run in
// half-hour slots, so thirty minutes of grace would consume an entire short
// booking before releasing it. Expect to tune this once there is real evidence
// about how late people actually are.
const NO_SHOW_GRACE_MINUTES = 15;

const MINUTE = 60 * 1000;

// Releases every booking whose holder never arrived.
//
// Follows expirePending: an indexed update run when a relevant endpoint is
// read, rather than a scheduler somebody has to operate. The front desk polling
// and the tablets polling keep it moving on their own.
//
// The desk frees itself as a consequence — the exclusion constraint only
// applies WHERE status IN ('pending','approved'), so a released row simply
// stops being an obstacle.
async function releaseNoShows(client = { query }) {
  const { rows } = await client.query(
    // Desks only. A conference room booked in advance has no way to be checked
    // in — the confirmation-code screen is for a person arriving at a desk, and
    // nobody has decided who checks a room in on behalf of a meeting. So this
    // swept up every room booking fifteen minutes after it started: the row
    // went to no_show, the booking vanished from the calendar and the
    // reservations list, and the room reported itself free while a meeting was
    // sitting in it. Silent, and it destroyed the booking rather than flagging
    // it.
    //
    // The rule is right for a desk, where an empty chair means the desk is
    // genuinely free. It is wrong for a room, where nobody taps anything on the
    // way in. When check-in for rooms is decided this filter is where it
    // changes; until then a room keeps its booking.
    `UPDATE reservations r
        SET status = 'no_show'
       FROM desks d
      WHERE d.desk_id = r.desk_id
        AND d.resource_type = 'desk'
        AND r.status = 'approved'
        AND r.checked_in_at IS NULL
        AND r.starts_at + ($1 || ' minutes')::interval < now()
      RETURNING r.reservation_id`,
    [NO_SHOW_GRACE_MINUTES]
  );

  for (const row of rows) {
    await recordActivity({
      activityType: 'released_no_show',
      reservationId: row.reservation_id,
      description: `Desk released after ${NO_SHOW_GRACE_MINUTES} minutes with no check-in`,
    }, client);
  }

  return rows.length;
}

// Which statuses may be checked in, stated as an allow-list.
//
// It was a deny-list — refuse canceled, denied and pending, let anything else
// through — and `expired` fell straight past it into an update that sets the
// row to 'approved'. A request nobody ever reviewed could be walked up to the
// front desk and turned into a desk, which is the whole thing the approval
// queue exists to prevent. A deny-list silently admits every status added
// afterwards, and 'no_show' had just been added.
//
// 'approved' is the ordinary case. 'no_show' is the reclaim: the desk was
// released because nobody arrived, and they have now arrived.
const CHECK_IN_ALLOWED = ['approved', 'no_show'];

const REFUSALS = {
  pending: 'That booking has not been approved yet. Ask an administrator.',
  expired: 'That request was never reviewed and has expired. Ask the front desk.',
  denied: 'That request was not approved.',
  canceled: 'That booking was cancelled.',
};

// Why a particular booking cannot be checked in, or null when it can.
//
// Separate from the update so the front desk can explain a refusal in the same
// words whatever surface asked. Every branch names the actual situation: "that
// booking was yesterday" is useful, "cannot check in" is not.
function checkInProblem(row, now = new Date()) {
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);

  if (row.checked_in_at) return { code: 'already', message: 'Already checked in.' };

  if (!CHECK_IN_ALLOWED.includes(row.status)) {
    return {
      code: row.status,
      message: REFUSALS[row.status] || 'That booking cannot be checked in.',
    };
  }
  if (now > endsAt) {
    return { code: 'over', message: 'That booking has already finished.' };
  }
  if (now < new Date(startsAt.getTime() - EARLY_CHECK_IN_MINUTES * MINUTE)) {
    return {
      code: 'early',
      message: `Too early — check in from ${EARLY_CHECK_IN_MINUTES} minutes before it starts.`,
    };
  }
  return null;
}

// Checks in the occurrence a code resolves to today.
//
// Handles the reclaim: a booking already released as a no-show is restored,
// provided nothing has taken the desk in the meantime. Releasing at 09:15 and
// then refusing somebody who arrives at 09:20 to an empty desk would create a
// complaint and save nothing. Whether the desk is still free is not asked —
// the exclusion constraint answers it by refusing the update.
async function checkInByCode(code) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Both tables: a one-off carries its own code, a schedule carries one code
    // for the whole arrangement and today's occurrence is the row that matters.
    const { rows } = await client.query(
      `SELECT r.reservation_id, r.starts_at, r.ends_at, r.status, r.checked_in_at,
              u.first_name, u.last_name, d.desk_number, coalesce(d.display_name, 'Desk# ' || d.desk_number) AS desk_label
         FROM reservations r
         JOIN users u ON u.user_id = r.user_id
         JOIN desks d ON d.desk_id = r.desk_id
    LEFT JOIN recurring_schedules s ON s.schedule_id = r.schedule_id
    LEFT JOIN recurring_schedules lead ON lead.series_id = s.series_id
        WHERE (r.confirmation_code = $1 OR lead.series_code = $1)
          AND r.starts_at::date = current_date
        ORDER BY r.starts_at
        LIMIT 1`,
      [code]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'not_found' };
    }

    const booking = rows[0];
    const problem = checkInProblem(booking);
    if (problem) {
      await client.query('ROLLBACK');
      return { ok: false, ...problem, booking };
    }

    try {
      await client.query(
        `UPDATE reservations
            SET checked_in_at = now(),
                status = 'approved'
          WHERE reservation_id = $1`,
        [booking.reservation_id]
      );
    } catch (err) {
      // Only reachable on a reclaim: restoring a released booking puts the row
      // back under the exclusion constraint, and somebody else has the desk.
      if (err.constraint === 'no_double_booking') {
        await client.query('ROLLBACK');
        return {
          ok: false,
          code: 'taken',
          message: `${booking.desk_label} was given to somebody else after the booking was released. Ask the front desk for another.`,
          booking,
        };
      }
      throw err;
    }

    const reclaimed = booking.status === 'no_show';
    await recordActivity({
      activityType: 'checked_in',
      reservationId: booking.reservation_id,
      description: reclaimed
        ? `Checked in at ${booking.desk_label}, reclaiming a released booking`
        : `Checked in at ${booking.desk_label}`,
      metadata: reclaimed ? { reclaimed: true } : null,
    }, client);

    await client.query('COMMIT');
    return { ok: true, booking, reclaimed };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  EARLY_CHECK_IN_MINUTES,
  NO_SHOW_GRACE_MINUTES,
  releaseNoShows,
  checkInProblem,
  checkInByCode,
};
