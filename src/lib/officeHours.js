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

export const isWithinOfficeHours = (startMin, endMin) =>
  startMin >= OFFICE_START &&
  endMin <= OFFICE_END &&
  endMin > startMin &&
  startMin % SLOT_MINUTES === 0 &&
  endMin % SLOT_MINUTES === 0;
