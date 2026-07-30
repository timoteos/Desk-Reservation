const { recordActivity } = require('./activityLog');

// Ending a schedule, from either side of the desk.
//
// An admin ends one from the Schedules tab; a holder ends their own with the
// confirmation code. Those are the same operation and were about to become two
// implementations of it — the shape behind ten of this project's defects — so
// they share this. What differs is only who is recorded as having done it.
//
// Only future bookings are released. Occurrences already served are history and
// cancelling them would rewrite what happened. The schedule rows are closed off
// too, so nothing regenerates and active_until records when it actually stopped.
async function endSeries(client, { scheduleId, actorUserId = null, byCode = false }) {
  // A Mon/Wed/Fri pattern is three schedule rows, so ending it means ending
  // every row sharing the series_id — reached from whichever row was named.
  const { rows: siblings } = await client.query(
    `SELECT s2.schedule_id, u.first_name, u.last_name
       FROM recurring_schedules s1
       JOIN recurring_schedules s2 ON s2.series_id = s1.series_id
       JOIN users u ON u.user_id = s2.user_id
      WHERE s1.schedule_id = $1 AND s2.status <> 'canceled'`,
    [scheduleId]
  );

  if (siblings.length === 0) return null;

  const scheduleIds = siblings.map((r) => r.schedule_id);

  const { rowCount } = await client.query(
    `UPDATE reservations
        SET status = 'canceled', expires_at = NULL,
            decided_by_user_id = $2, decided_at = now()
      WHERE schedule_id = ANY($1::int[])
        AND status IN ('pending', 'approved')
        AND ends_at > now()`,
    [scheduleIds, actorUserId]
  );

  await client.query(
    `UPDATE recurring_schedules
        SET status = 'canceled', expires_at = NULL, active_until = CURRENT_DATE,
            decided_by_user_id = $2, decided_at = now()
      WHERE schedule_id = ANY($1::int[])`,
    [scheduleIds, actorUserId]
  );

  const holder = `${siblings[0].first_name} ${siblings[0].last_name}`;

  await recordActivity({
    activityType: 'series_ended',
    scheduleId: Number(scheduleId),
    actorUserId,
    metadata: { bookingsCanceled: rowCount, scheduleIds, byCode },
    description: byCode
      ? `${holder} ended their own recurring schedule using the confirmation code — `
        + `${rowCount} upcoming booking(s) released`
      : `Ended ${holder}'s recurring schedule — ${rowCount} upcoming booking(s) released`,
  }, client);

  return { holder, scheduleIds, bookingsCanceled: rowCount };
}

module.exports = { endSeries };
