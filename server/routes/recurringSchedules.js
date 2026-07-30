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

// POST /api/recurring-schedules
// { email, days: { mon: { startMin, endMin }, ... }, activeFrom?, activeUntil? }
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, days, activeFrom, activeUntil } = req.body;

    if (!email || !days || Object.keys(days).length === 0) {
      return res.status(400).json({ message: 'email and at least one day are required' });
    }

    const invalid = Object.keys(days).filter((key) => !DAY_NUMBERS[key]);
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Unknown day: ${invalid.join(', ')}` });
    }

    // The window the pattern runs over. Never earlier than today, since a
    // schedule cannot generate bookings into the past.
    const today = startOfToday();
    const requestedFrom = parseDay(activeFrom);
    if (activeFrom && !requestedFrom) {
      return res.status(400).json({ message: 'Start date is not a valid date.' });
    }
    const from = requestedFrom && requestedFrom > today ? requestedFrom : today;

    const requestedUntil = parseDay(activeUntil);
    if (activeUntil && !requestedUntil) {
      return res.status(400).json({ message: 'End date is not a valid date.' });
    }
    if (requestedUntil && requestedUntil < from) {
      return res.status(400).json({ message: 'The end date must be on or after the start date.' });
    }

    const ceiling = new Date(from.getTime() + (MAX_HORIZON_DAYS - 1) * DAY_MS);
    const openEnded = !requestedUntil;
    const to = openEnded
      ? new Date(from.getTime() + (DEFAULT_HORIZON_DAYS - 1) * DAY_MS)
      : new Date(Math.min(requestedUntil.getTime(), ceiling.getTime()));
    const cappedAtCeiling = !!requestedUntil && requestedUntil > ceiling;

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

    // Every slot this pattern implies, so a desk can be chosen against the
    // whole set rather than one day at a time.
    const slots = [];
    for (const [dayKey, times] of Object.entries(days)) {
      const dayNumber = DAY_NUMBERS[dayKey];
      const hoursProblem = officeHoursError(times.startMin, times.endMin);
      if (hoursProblem) {
        return res.status(400).json({ message: `${hoursProblem} (${dayKey})` });
      }
      for (const date of occurrencesFor([dayNumber], from, to)) {
        const startsAt = atTime(date, times.startMin);
        // Skip an occurrence whose time has already passed today — otherwise a
        // Monday pattern submitted on Monday afternoon generates a slot for
        // that morning, and expiry (2h before the first occurrence) lands in
        // the past, killing the whole request the moment it's made.
        if (startsAt <= new Date()) continue;
        slots.push({
          dayKey,
          dayNumber,
          startsAt,
          endsAt: atTime(date, times.endMin),
          startMin: times.startMin,
          endMin: times.endMin,
        });
      }
    }

    if (slots.length === 0) {
      return res.status(400).json({
        message: openEnded
          ? 'Every occurrence in that pattern has already passed. Try starting next week.'
          : 'That pattern produces no bookings between those dates. Check the days and the date range.',
      });
    }

    const deskResult = await client.query(
      'SELECT desk_id, desk_number FROM desks WHERE is_active ORDER BY desk_number'
    );

    // Pick the desk that can honour the most occurrences. A desk with an
    // existing booking on one Tuesday shouldn't disqualify it from the rest.
    let best = null;
    for (const desk of deskResult.rows) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS conflicts
           FROM reservations r
          WHERE r.desk_id = $1
            AND r.status IN ('pending', 'approved')
            AND EXISTS (
              SELECT 1 FROM unnest($2::timestamp[], $3::timestamp[]) AS s(starts_at, ends_at)
               WHERE tsrange(r.starts_at, r.ends_at) && tsrange(s.starts_at, s.ends_at)
            )`,
        [desk.desk_id, slots.map((s) => s.startsAt), slots.map((s) => s.endsAt)]
      );
      const conflicts = rows[0].conflicts;
      if (best === null || conflicts < best.conflicts) {
        best = { ...desk, conflicts };
      }
      if (conflicts === 0) break;
    }

    if (!best) {
      return res.status(409).json({ message: 'No desks are configured.' });
    }

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
          best.desk_id,
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
            best.desk_id,
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
      metadata: { bookingsCreated: created.length, skipped: skipped.length, deskNumber: best.desk_number },
      description: `Recurring schedule requested — ${created.length} booking(s) on Desk# ${best.desk_number}`,
    }, client);

    await client.query('COMMIT');

    res.status(201).json({
      status: 'pending',
      expiresAt,
      deskNumber: best.desk_number,
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
