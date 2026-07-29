// Office hours as the API enforces them.
//
// Mirrors src/lib/officeHours.js — Create React App cannot import from outside
// src/, so the two are kept in step by hand. Keep this one authoritative: the
// frontend decides what to offer, this decides what is accepted. A request that
// bypasses the interface still cannot book the office at midnight.

const OFFICE_START = 450;  // 7:30 AM, in minutes from midnight
const OFFICE_END = 1020;   // 5:00 PM
const SLOT_MINUTES = 30;

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
};

const OFFICE_HOURS_LABEL = `${formatMinutes(OFFICE_START)} – ${formatMinutes(OFFICE_END)}`;

// Returns null when the window is fine, or a message explaining what is wrong.
// One function so every route rejects the same things for the same reasons.
function officeHoursError(startMin, endMin) {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
    return 'Start and end times must be whole minutes.';
  }
  if (endMin <= startMin) {
    return 'End time must be after start time.';
  }
  if (startMin < OFFICE_START || endMin > OFFICE_END) {
    return `Bookings must fall within office hours, ${OFFICE_HOURS_LABEL}.`;
  }
  if (startMin % SLOT_MINUTES !== 0 || endMin % SLOT_MINUTES !== 0) {
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

module.exports = {
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
