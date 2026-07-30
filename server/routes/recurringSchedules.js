const express = require('express');
const { pool } = require('../db');
const { generateConfirmationCode, generateUniqueCode, toDateString } = require('../lib/reservationShape');
const { expiryFor } = require('../lib/expirePending');
const { recordActivity } = require('../lib/activityLog');
const { readToken } = require('../lib/auth');
const {
  DAY_NUMBERS,
  minutesToTime,
  planPattern,
  deskAvailability,
} = require('../lib/recurringPattern');

const router = express.Router();

// POST /api/recurring-schedules/availability
// { days, activeFrom?, activeUntil?, ignoreSeriesId? }
//
// What each desk could offer this pattern, so the requester can choose rather
// than being assigned one and told afterwards. A preview rather than a GET
// because the pattern is the input, and it does not fit in a query string.
//
// Open, because requesting a schedule is. readToken is here only to tell an
// admin apart from an ordinary requester, for ignoreSeriesId below.
router.post('/availability', readToken, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const plan = planPattern(req.body || {});
    if (plan.error) return res.status(400).json({ message: plan.error });

    // An edit previews against a pattern the schedule itself already occupies,
    // so it says which schedule to discount. Left out by a new request.
    //
    // Admins only. This endpoint is open, and honouring the parameter for anyone
    // meant an unauthenticated caller could name any series and be told a desk
    // was free that it holds — a map promising what the booking would refuse,
    // which is the failure this project has produced more than any other.
    const isAdmin = req.user?.role === 'admin';
    const desks = await deskAvailability(client, plan.slots, {
      ignoreSeriesId: isAdmin && req.body?.ignoreSeriesId
        ? Number(req.body.ignoreSeriesId)
        : null,
    });

    res.json({
      occurrences: plan.slots.length,
      activeFrom: toDateString(plan.from),
      activeUntil: plan.openEnded ? null : toDateString(plan.to),
      openEnded: plan.openEnded,
      generatedThrough: toDateString(plan.to),
      cappedAtCeiling: plan.cappedAtCeiling,
      desks,
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/recurring-schedules
// { email, days: { mon: { startMin, endMin }, ... }, activeFrom?, activeUntil? }
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, days, activeFrom, activeUntil, deskId } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    // Same planner the availability preview uses, so the map cannot promise a
    // desk this route would then refuse.
    const plan = planPattern({ days, activeFrom, activeUntil });
    if (plan.error) return res.status(400).json({ message: plan.error });
    const { from, to, openEnded, slots, cappedAtCeiling } = plan;

    const userResult = await client.query(
      'SELECT user_id FROM users WHERE lower(email) = lower($1) AND is_active',
      [email.trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: `No account found for ${email.trim()}. Check the address or contact your administrator.`,
      });
    }
    const userId = userResult.rows[0].user_id;

    const availability = await deskAvailability(client, slots);
    if (availability.length === 0) {
      return res.status(409).json({ message: 'No desks are configured.' });
    }

    // A schedule is all of its days or none of them.
    //
    // A partial one is a different thing wearing the same name. The point of a
    // recurring booking is that the desk is yours for the duration — you leave
    // things there and settle in — which cannot be true if somebody else has it
    // on the third Wednesday. And on a skipped day the holder gets nothing at
    // all, not an alternative desk, so they would have to track which scattered
    // dates are not theirs. Refusing is better information than half-granting.
    //
    // Once approved the exclusion constraint makes those slots untouchable, so a
    // schedule that fits at request time really is an exclusive desk.
    let best;
    if (deskId != null) {
      best = availability.find((d) => d.deskId === Number(deskId));
      if (!best) {
        return res.status(400).json({
          message: 'That desk is not available — it may have been taken out of service.',
        });
      }
      if (best.conflicts > 0) {
        return res.status(409).json({
          message: `Desk# ${best.deskNumber} is already booked on `
            + `${best.conflicts} of the ${best.occurrences} days in that pattern, and a schedule `
            + 'has to cover every day. Pick another desk, or change the dates.',
        });
      }
    } else {
      const clear = availability.filter((d) => d.conflicts === 0);
      if (clear.length === 0) {
        // Naming the closest desk makes the refusal actionable: shifting the
        // dates or clearing a couple of bookings may be all it takes.
        const closest = availability.reduce((a, b) => (b.conflicts < a.conflicts ? b : a));
        return res.status(409).json({
          message: 'No desk is free for every day in that pattern. '
            + `Desk# ${closest.deskNumber} comes closest, with ${closest.conflicts} of `
            + `${closest.occurrences} days already booked. Try different dates or days.`,
        });
      }
      // Random among the desks that fit, so schedules spread across the office
      // rather than piling onto the lowest-numbered desk.
      best = clear[Math.floor(Math.random() * clear.length)];
    }

    const chosenDesk = { desk_id: best.deskId, desk_number: best.deskNumber };

    await client.query('BEGIN');

    // Expiry is based on the FIRST occurrence across the whole pattern —
    // per-occurrence would kill a 90-day schedule once its first Monday passed.
    const firstOccurrence = slots.reduce(
      (earliest, s) => (s.startsAt < earliest ? s.startsAt : earliest),
      slots[0].startsAt
    );
    const expiresAt = expiryFor(firstOccurrence);

    // Pending: the bookings below are generated immediately so the slots are
    // held from the moment of request, then flip to approved in one action.
    // series_id ties the weekday rows together. The first row inserted names the
    // series, including itself, so identity does not depend on anything derivable
    // that a later edit could change.
    const scheduleIds = {};
    let seriesId = null;
    let seriesCode = null;
    for (const [dayKey, times] of Object.entries(days)) {
      const { rows } = await client.query(
        `INSERT INTO recurring_schedules
           (user_id, desk_id, day_of_week, start_time, end_time, status, expires_at,
            active_from, active_until, series_id)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
         RETURNING schedule_id`,
        [
          userId,
          chosenDesk.desk_id,
          DAY_NUMBERS[dayKey],
          minutesToTime(times.startMin),
          minutesToTime(times.endMin),
          expiresAt,
          toDateString(from),
          // Null when open-ended, so the row records that no end was chosen
          // rather than pretending the rolling horizon was a decision.
          openEnded ? null : toDateString(to),
          seriesId,
        ]
      );
      scheduleIds[dayKey] = rows[0].schedule_id;
      if (seriesId === null) {
        seriesId = rows[0].schedule_id;
        // The one code the holder gets, on the row that names the series. It
        // outlives every edit, because an admin moving the desk does not give
        // somebody a new arrangement.
        seriesCode = await generateUniqueCode(client);
        await client.query(
          'UPDATE recurring_schedules SET series_id = $1, series_code = $2 WHERE schedule_id = $1',
          [seriesId, seriesCode]
        );
      }
    }

    // No savepoints: a collision fails the whole request rather than being
    // skipped. The availability check above should have caught it, so reaching
    // here means somebody booked the slot in between — a race, not a plan — and
    // half a schedule is not what was asked for.
    const created = [];
    for (const slot of slots) {
      await client.query(
        `INSERT INTO reservations
           (user_id, desk_id, schedule_id, starts_at, ends_at, confirmation_code,
            expires_at, booking_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'recurring')`,
        [
          userId,
          chosenDesk.desk_id,
          scheduleIds[slot.dayKey],
          slot.startsAt,
          slot.endsAt,
          generateConfirmationCode(),
          expiresAt,
        ]
      );
      created.push(slot);
    }

    // One entry for the request, not one per generated booking — 39 rows would
    // bury everything else in the trail.
    await recordActivity({
      activityType: 'schedule_requested',
      scheduleId: Object.values(scheduleIds)[0],
      actorUserId: userId,
      metadata: { bookingsCreated: created.length, deskNumber: chosenDesk.desk_number },
      description: `Recurring schedule requested — ${created.length} booking(s) on Desk# ${chosenDesk.desk_number}`,
    }, client);

    await client.query('COMMIT');

    res.status(201).json({
      status: 'pending',
      // One code for the arrangement, not one per generated day.
      confirmationCode: seriesCode,
      expiresAt,
      deskNumber: chosenDesk.desk_number,
      activeFrom: toDateString(from),
      activeUntil: openEnded ? null : toDateString(to),
      openEnded,
      // Stated so an open-ended holder knows the bookings stop rather than
      // finding out by turning up to nothing.
      generatedThrough: toDateString(to),
      cappedAtCeiling,
      created: created.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'One of those days was booked while this request was being made. '
          + 'Nothing was reserved — try again.',
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
