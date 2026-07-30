// When the office is open, and the granularity bookings are made at.
//
// This was previously copied into five files under three different names
// (DAY_START, OFFICE_START, MINS_IN_WORKDAY), which is how the calendar and the
// edit dialog came to disagree about what a valid time was. Change it here.
//
// Mirrored in server/lib/officeHours.js — Create React App cannot import from
// outside src/, so the two files have to be kept in step by hand. The server
// copy is the one that actually enforces this; the frontend copy only decides
// what to offer.

export const OFFICE_START = 450;  // 7:30 AM, in minutes from midnight
export const OFFICE_END = 1020;   // 5:00 PM
export const SLOT_MINUTES = 30;   // bookings start and end on the half hour

export const MINS_IN_WORKDAY = OFFICE_END - OFFICE_START;

export const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
};

export const toTimeValue = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export const toMinutes = (value) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

export const OFFICE_HOURS_LABEL = `${formatMinutes(OFFICE_START)} – ${formatMinutes(OFFICE_END)}`;

// Every legal time on the half hour. `from` excludes earlier options, which is
// what an end-time picker needs so it can never sit at or before the start.
export const timeOptions = ({ from = OFFICE_START, to = OFFICE_END } = {}) => {
  const options = [];
  for (let m = from; m <= to; m += SLOT_MINUTES) {
    options.push({ value: m, label: formatMinutes(m) });
  }
  return options;
};

// The office is open Monday to Friday. Recurring schedules already assumed
// this — they only ever offered mon–fri — but one-off bookings did not, so the
// same system both advertised and ignored the rule.
export const WORKING_DAYS = [1, 2, 3, 4, 5];

// Takes 'YYYY-MM-DD'. Parsed with an explicit time because a bare date string
// is read as UTC, which can land on the previous day west of Greenwich and
// report a Monday as a Sunday.
export const isWorkingDay = (dateStr) =>
  !!dateStr && WORKING_DAYS.includes(new Date(`${dateStr}T00:00:00`).getDay());

const todayString = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The earliest minute a booking may start on this date.
//
// The calendar had this logic inline and nothing else did, so the desk page and
// the admin dialog would happily offer a window that had already begun and only
// fail on submit. One definition, used by all three.
//
// Always the slot AFTER the current one, never the one in progress: a booking
// starting at the exact current minute is refused by the API by the time the
// request lands. A value past OFFICE_END means the day is over.
export const earliestStartOn = (dateStr) => {
  if (!dateStr) return OFFICE_START;
  const today = todayString();
  if (dateStr > today) return OFFICE_START;
  if (dateStr < today) return OFFICE_END + SLOT_MINUTES;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < OFFICE_START) return OFFICE_START;
  return Math.floor(nowMin / SLOT_MINUTES) * SLOT_MINUTES + SLOT_MINUTES;
};

// Whether a window can still be booked at all. Decides what the interface
// offers; the API decides what it accepts, comparing exact timestamps rather
// than slot boundaries.
export const isStartBookable = (dateStr, startMin) =>
  isWorkingDay(dateStr) && startMin >= earliestStartOn(dateStr);

export const isWithinOfficeHours = (startMin, endMin) =>
  startMin >= OFFICE_START &&
  endMin <= OFFICE_END &&
  endMin > startMin &&
  startMin % SLOT_MINUTES === 0 &&
  endMin % SLOT_MINUTES === 0;
