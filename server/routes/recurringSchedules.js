const express = require('express');
const { pool, query } = require('../db');
const { generateConfirmationCode, toDateString } = require('../lib/reservationShape');
const { expiryFor } = require('../lib/expirePending');
const { recordActivity } = require('../lib/activityLog');
const { officeHoursError } = require('../lib/officeHours');

const router = express.Router();

// Occurrences have to exist as real rows: the exclusion constraint can only see
// rows, so a schedule that computed its occurrences on the fly would get no
// double-booking protection at all.
//
// How far ahead they materialise now comes from the schedule's own end date.
// active_from and active_until have been in the schema since the ERD and were
// ignored in favour of a flat 90 days, which meant a six-week contract was
// granted about 34 bookings nobody could reclaim — one desk of twelve, held for
// weeks past the point anyone would use it.
//
// Open-ended schedules still need a limit, since rows cannot be generated
// forever. 90 days remains that limit, and the response says so rather than
// leaving the holder to discover their bookings stop.
const DEFAULT_HORIZON_DAYS = 90;

// A hard ceiling, so a typo in the end date cannot lock desks into 2099.
const MAX_HORIZON_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDay = (value) => {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const DAY_NUMBERS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

const minutesToTime = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Every date between from and to inclusive that falls on one of the weekdays.
function occurrencesFor(dayNumbers, from, to) {
  const dates = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= to) {
    if (dayNumbers.includes(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

const atTime = (date, minutes) => {
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
};


// Turns a request body into the window it covers and every slot it implies.
//
// Shared by the availability preview and the booking itself: if these disagreed,
// the map would promise a desk the booking then refused. Returns { error } for
// anything the caller got wrong, so both routes reject identically.
function planPattern({ days, activeFrom, activeUntil }) {
  if (!days || Object.keys(days).length === 0) {
    return { error: 'At least one day is required.' };
  }

  const invalid = Object.keys(days).filter((key) => !DAY_NUMBERS[key]);
  if (invalid.length > 0) return { error: `Unknown day: ${invalid.join(', ')}` };

  const today = startOfToday();
  const requestedFrom = parseDay(activeFrom);
  if (activeFrom && !requestedFrom) return { error: 'Start date is not a valid date.' };
  const from = requestedFrom && requestedFrom > today ? requestedFrom : today;

  const requestedUntil = parseDay(activeUntil);
  if (activeUntil && !requestedUntil) return { error: 'End date is not a valid date.' };
  if (requestedUntil && requestedUntil < from) {
    return { error: 'The end date must be on or after the start date.' };
  }

  const ceiling = new Date(from.getTime() + (MAX_HORIZON_DAYS - 1) * DAY_MS);
  const openEnded = !requestedUntil;
  const to = openEnded
    ? new Date(from.getTime() + (DEFAULT_HORIZON_DAYS - 1) * DAY_MS)
    : new Date(Math.min(requestedUntil.getTime(), ceiling.getTime()));

  const slots = [];
  for (const [dayKey, times] of Object.entries(days)) {
    const hoursProblem = officeHoursError(times.startMin, times.endMin);
    if (hoursProblem) return { error: `${hoursProblem} (${dayKey})` };

    for (const date of occurrencesFor([DAY_NUMBERS[dayKey]], from, to)) {
      const startsAt = atTime(date, times.startMin);
      // Skip an occurrence whose time has already passed today — otherwise a
      // Monday pattern submitted on Monday afternoon generates a slot for that
      // morning, and expiry lands in the past, killing the whole request.
      if (startsAt <= new Date()) continue;
      slots.push({
        dayKey,
        dayNumber: DAY_NUMBERS[dayKey],
        startsAt,
        endsAt: atTime(date, times.endMin),
        startMin: times.startMin,
        endMin: times.endMin,
      });
    }
  }

  if (slots.length === 0) {
    return {
      error: openEnded
        ? 'Every occurrence in that pattern has already passed. Try starting next week.'
        : 'That pattern produces no bookings between those dates. Check the days and the date range.',
    };
  }

  return {
    from,
    to,
    openEnded,
    slots,
    cappedAtCeiling: !!requestedUntil && requestedUntil > ceiling,
  };
}

// How many of a pattern's slots each active desk could honour.
//
// Availability for a recurring pattern is not a yes or a no: a desk booked on
// three Tuesdays out of sixty-five occurrences is neither free nor unusable.
// Callers get the counts and decide what to do with a partial.
async function deskAvailability(client, slots) {
  const { rows: desks } = await client.query(
    'SELECT desk_id, desk_number FROM desks WHERE is_active ORDER BY desk_number'
  );

  const starts = slots.map((s) => s.startsAt);
  const ends = slots.map((s) => s.endsAt);

  const out = [];
  for (const desk of desks) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS conflicts
         FROM reservations r
        WHERE r.desk_id = $1
          AND r.status IN ('pending', 'approved')
          AND EXISTS (
            SELECT 1 FROM unnest($2::timestamp[], $3::timestamp[]) AS s(starts_at, ends_at)
             WHERE tsrange(r.starts_at, r.ends_at) && tsrange(s.starts_at, s.ends_at)
          )`,
      [desk.desk_id, starts, ends]
    );
    out.push({
      deskId: desk.desk_id,
      deskNumber: desk.desk_number,
      occurrences: slots.length,
      conflicts: rows[0].conflicts,
      bookable: slots.length - rows[0].conflicts,
    });
  }
  return out;
}

// POST /api/recurring-schedules/availability
// { days, activeFrom?, activeUntil? }
//
// What each desk could offer this pattern, so the requester can choose rather
// than being assigned one and told afterwards. A preview rather than a GET
// because the pattern is the input, and it does not fit in a query string.
router.post('/availability', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const plan = planPattern(req.body || {});
    if (plan.error) return res.status(400).json({ message: plan.error });

    const desks = await deskAvailability(client, plan.slots);

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

    let best;
    if (deskId != null) {
      // An explicit choice is honoured even when partly taken — the requester
      // was shown how many days it covers and picked it anyway. Refusing here
      // would contradict what the map offered.
      best = availability.find((d) => d.deskId === Number(deskId));
      if (!best) {
        return res.status(400).json({
          message: 'That desk is not available — it may have been taken out of service.',
        });
      }
      if (best.bookable === 0) {
        return res.status(409).json({
          message: `Desk# ${best.deskNumber} is booked for every day in that pattern. Pick another desk.`,
        });
      }
    } else {
      // No choice made: the desk that honours the most occurrences.
      best = availability.reduce((a, b) => (b.conflicts < a.conflicts ? b : a));
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
    const scheduleIds = {};
    for (const [dayKey, times] of Object.entries(days)) {
      const { rows } = await client.query(
        `INSERT INTO recurring_schedules
           (user_id, desk_id, day_of_week, start_time, end_time, status, expires_at,
            active_from, active_until)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
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
        ]
      );
      scheduleIds[dayKey] = rows[0].schedule_id;
    }

    // An occurrence that collides with an existing booking is skipped rather
    // than failing the batch — the constraint rejecting it is correct.
    const created = [];
    const skipped = [];
    for (const slot of slots) {
      try {
        await client.query('SAVEPOINT occurrence');
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
        await client.query('RELEASE SAVEPOINT occurrence');
        created.push(slot);
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT occurrence');
        if (err.constraint === 'no_double_booking') {
          skipped.push(slot);
        } else {
          throw err;
        }
      }
    }

    // One entry for the request, not one per generated booking — 39 rows would
    // bury everything else in the trail.
    await recordActivity({
      activityType: 'schedule_requested',
      scheduleId: Object.values(scheduleIds)[0],
      actorUserId: userId,
      metadata: { bookingsCreated: created.length, skipped: skipped.length, deskNumber: chosenDesk.desk_number },
      description: `Recurring schedule requested — ${created.length} booking(s) on Desk# ${chosenDesk.desk_number}`,
    }, client);

    await client.query('COMMIT');

    res.status(201).json({
      status: 'pending',
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
      skipped: skipped.map((s) => ({
        date: toDateString(s.startsAt),
        startMin: s.startMin,
        endMin: s.endMin,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
