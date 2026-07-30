const { query } = require('../db');
const { officeHoursError } = require('./officeHours');

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


module.exports = {
  DAY_NUMBERS,
  DEFAULT_HORIZON_DAYS,
  MAX_HORIZON_DAYS,
  minutesToTime,
  occurrencesFor,
  atTime,
  planPattern,
  deskAvailability,
};
