// Office hours as the API enforces them.
//
// Mirrors src/lib/officeHours.js — Create React App cannot import from outside
// src/, so the two are kept in step by hand. Keep this one authoritative: the
// frontend decides what to offer, this decides what is accepted. A request that
// bypasses the interface still cannot book the office at midnight.

// The office is in Honolulu, and so is every time this app stores.
//
// starts_at and ends_at are `timestamp without time zone` — wall clock, no
// offset — which round-trips correctly whatever timezone the server runs in.
// What does not round-trip is comparing one of those to `new Date()`: the Date
// was built with `new Date(y, m, d, h, min)`, which reads the *server's* zone,
// so on a UTC host "3pm today" becomes an instant ten hours before Honolulu's
// 3pm and every slot in the working day reports as already past. That is
// precisely what happened on Render: bookings for today were impossible from
// 7am Hawaii time onwards, while the same code on a laptop in HST was fine.
//
// Setting TZ here rather than in the host's dashboard keeps the fix in version
// control, applies to every entry point that computes an office time, and
// cannot be forgotten when the app moves to a different host.
//
// Unconditional, deliberately. Honouring an ambient TZ would mean a host that
// exports TZ=UTC — which is most of them — silently reinstates the bug, and the
// value being overridden is not a preference anybody holds: it is where the
// desks physically are.
//
// This is a module side effect, which is unusual — it lives here because this
// file is what defines the office's day, and a timezone is part of that
// definition. If MQD ever has an office outside Hawaii, this is the assumption
// that has to be replaced with a per-office zone.
const OFFICE_TZ = 'Pacific/Honolulu';
process.env.TZ = OFFICE_TZ;

const OFFICE_START = 450;  // 7:30 AM, in minutes from midnight
const OFFICE_END = 1020;   // 5:00 PM
const SLOT_MINUTES = 30;

// How long before a slot starts bookings close. Somebody heading to a desk for
// an 11:00 start can still claim it at 10:55, but not at 10:56 — the desk needs
// to stop being bookable slightly before it is meant to be occupied.
const BOOKING_LEAD_MINUTES = 5;

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
};

const OFFICE_HOURS_LABEL = `${formatMinutes(OFFICE_START)} – ${formatMinutes(OFFICE_END)}`;

// Returns null when the window is fine, or a message explaining what is wrong.
// One function so every route rejects the same things for the same reasons.
// `alignStart: false` for a desk claimed on the spot. The half-hour rule exists
// so pickers offer a tidy list of choices; somebody standing at a free desk at
// 11:37 is not choosing a start, they are taking one. Making them wait until
// 12:00 would be the rule enforcing itself against its own purpose. The end is
// still aligned, because that one is chosen.
function officeHoursError(startMin, endMin, { alignStart = true } = {}) {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
    return 'Start and end times must be whole minutes.';
  }
  if (endMin <= startMin) {
    return 'End time must be after start time.';
  }
  if (startMin < OFFICE_START || endMin > OFFICE_END) {
    return `Bookings must fall within office hours, ${OFFICE_HOURS_LABEL}.`;
  }
  if ((alignStart && startMin % SLOT_MINUTES !== 0) || endMin % SLOT_MINUTES !== 0) {
    return `Bookings start and end on the half hour.`;
  }
  return null;
}

// The office is open Monday to Friday. Recurring schedules already assumed
// this — DAY_NUMBERS only maps mon–fri — but one-off bookings did not.
const WORKING_DAYS = [1, 2, 3, 4, 5];

// Accepts a 'YYYY-MM-DD' string or a Date. A bare date string is parsed as UTC,
// which west of Greenwich lands on the previous day and would report a Monday
// as a Sunday, so the time is stated explicitly.
function workingDayError(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'That date is not valid.';
  if (!WORKING_DAYS.includes(d.getDay())) {
    return 'The office is open Monday to Friday. Pick a weekday.';
  }
  return null;
}

// Convenience for routes that hold timestamps rather than minute offsets.
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();

// Whether a slot is still claimable, as one function so the three routes that
// create or move a booking answer it identically. They each carried their own
// `startsAt <= new Date()`, which is how a lead time could have been added to
// one of them and not the others.
//
// The two cases are separated because they are different situations to be in:
// asking for yesterday is a mistake, and asking for a slot four minutes out is
// a near miss that deserves to say so.
function tooSoonError(startsAt) {
  const now = Date.now();
  const start = startsAt.getTime();

  if (start <= now) {
    return 'That time has already passed. Pick a later slot.';
  }
  if (start < now + BOOKING_LEAD_MINUTES * 60 * 1000) {
    return `Bookings close ${BOOKING_LEAD_MINUTES} minutes before a slot starts. Pick a later slot.`;
  }
  return null;
}

module.exports = {
  OFFICE_TZ,
  BOOKING_LEAD_MINUTES,
  tooSoonError,
  OFFICE_START,
  OFFICE_END,
  SLOT_MINUTES,
  WORKING_DAYS,
  OFFICE_HOURS_LABEL,
  formatMinutes,
  officeHoursError,
  workingDayError,
  minutesOf,
};
