const { query } = require('../db');

// Cancelling is split by who did it. "Steve cancelled his own booking" and
// "an admin cancelled Steve's booking" are different events to anyone reading
// the trail, and the actor alone can't distinguish them — a holder cancelling
// by confirmation code isn't signed in, so their actor is null too.
const ACTIVITIES = {
  created: 'Reservation requested',
  booked_by_admin: 'Booked by an administrator',
  approved: 'Request approved',
  denied: 'Request denied',
  canceled: 'Cancelled by the holder',
  overridden: 'Cancelled by an administrator',
  // One entry per edit, even when the desk and the time both change — that was
  // one decision by one person, and splitting it would read as two.
  modified: 'Edited by an administrator',
  expired: 'Request expired unreviewed',
  schedule_requested: 'Recurring schedule requested',
};

async function seedActivities(client = { query }) {
  for (const [type, label] of Object.entries(ACTIVITIES)) {
    await client.query(
      `INSERT INTO activities (activity_type, label) VALUES ($1, $2)
       ON CONFLICT (activity_type) DO UPDATE SET label = EXCLUDED.label`,
      [type, label]
    );
  }
}

// Records one entry. Pass `client` to enrol the write in an existing
// transaction, so a state change and its audit record commit together.
//
// A failure here never breaks the operation that triggered it: an approval
// that worked should not be reported as failed because the trail could not be
// written. The reservation itself also stores decided_by_user_id, so the
// critical "who decided this" survives even if a log write is lost.
async function recordActivity(
  { activityType, reservationId = null, scheduleId = null, actorUserId = null, metadata = null, description = null },
  client = { query }
) {
  try {
    await client.query(
      `INSERT INTO logs
         (activity_id, reservation_id, schedule_id, actor_user_id, metadata, description)
       VALUES ((SELECT activity_id FROM activities WHERE activity_type = $1),
               $2, $3, $4, $5, $6)`,
      [activityType, reservationId, scheduleId, actorUserId, metadata, description]
    );
  } catch (err) {
    console.error(`Failed to record "${activityType}" activity:`, err.message);
  }
}

module.exports = { ACTIVITIES, seedActivities, recordActivity };
