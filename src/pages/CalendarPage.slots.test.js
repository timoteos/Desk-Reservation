import { getAvailableSlots } from './CalendarPage';
import { OFFICE_START, OFFICE_END, MINS_IN_WORKDAY, SLOT_MINUTES } from '../lib/officeHours';

// The calendar's slot list, tested directly rather than through the page.
//
// This was reported from the running app — "I can't book today, the earliest is
// Monday" — and no test here would have caught it, because the rule that broke
// is arithmetic and the only coverage was rendering.
//
// earliestMin is passed in rather than read from the clock, so these do not
// depend on when they run. What the clock produces is earliestStartOn's job and
// is covered in src/lib/officeHours.test.js.

const AFTERNOON = 870;   // 2:30 PM, the slot in progress at 2:38
const ALL_SPACES = 14;   // twelve desks and two conference rooms

describe('a whole day means the rest of the day', () => {
  // The reported bug. As a fixed 570-minute block the only start that fit was
  // 7:30 AM, so from 7:31 onwards a full day could not be booked for today at
  // all — on a Friday afternoon the calendar's earliest offer was Monday.
  it('offers today from the earliest slot still open', () => {
    const slots = getAvailableSlots(MINS_IN_WORKDAY, [], AFTERNOON, ALL_SPACES, true);

    expect(slots).toHaveLength(1);
    expect(slots[0].startMin).toBe(AFTERNOON);
    expect(slots[0].endMin).toBe(OFFICE_END);
  });

  // Pinning the actual regression: the same call without the full-day rule is
  // what shipped, and it returns nothing. If this ever passes, the fix is gone.
  it('returned nothing at all as a fixed block', () => {
    expect(getAvailableSlots(MINS_IN_WORKDAY, [], AFTERNOON, ALL_SPACES, false)).toHaveLength(0);
  });

  // A day that has not started yet is still the whole day.
  it('is the full working day on a later date', () => {
    const slots = getAvailableSlots(MINS_IN_WORKDAY, [], OFFICE_START, ALL_SPACES, true);

    expect(slots).toHaveLength(1);
    expect(slots[0].startMin).toBe(OFFICE_START);
    expect(slots[0].endMin).toBe(OFFICE_END);
  });

  // One choice, not a list. Every later start would be a shorter day wearing
  // the same name, and offering "full day" five times over would be a lie four
  // of those times.
  it('is a single choice rather than one per boundary', () => {
    expect(getAvailableSlots(MINS_IN_WORKDAY, [], OFFICE_START, ALL_SPACES, true)).toHaveLength(1);
  });

  // Once the office has closed there is no day left to offer, and the answer is
  // nothing rather than a zero-length booking.
  it('offers nothing once the day is over', () => {
    expect(getAvailableSlots(MINS_IN_WORKDAY, [], OFFICE_END, ALL_SPACES, true)).toHaveLength(0);
  });

  // Capacity still applies: a whole day nobody can be given is not offered.
  it('is withheld when every space is taken for it', () => {
    const bookings = Array.from({ length: ALL_SPACES }, (_, i) => ({
      deskId: String(i + 1), startMin: OFFICE_START, endMin: OFFICE_END,
    }));

    expect(getAvailableSlots(MINS_IN_WORKDAY, bookings, OFFICE_START, ALL_SPACES, true))
      .toHaveLength(0);
  });
});

describe('hourly bookings are unaffected', () => {
  it('still steps through every boundary the duration fits in', () => {
    const slots = getAvailableSlots(60, [], AFTERNOON, ALL_SPACES, false);

    // 2:30, 3:00, 3:30 and 4:00, each running an hour to 5:00 at the latest.
    expect(slots).toHaveLength(4);
    expect(slots[0].startMin).toBe(AFTERNOON);
    expect(slots[slots.length - 1].endMin).toBe(OFFICE_END);
  });

  it('drops slots that have already started', () => {
    const slots = getAvailableSlots(60, [], AFTERNOON, ALL_SPACES, false);
    expect(slots.every((s) => s.startMin >= AFTERNOON)).toBe(true);
  });
});

describe('capacity counts the same set the bookings come from', () => {
  // The second bug found while chasing the first. The day's reservations come
  // back unfiltered, so a conference room booking is among them, while the
  // capacity they were measured against counted desks only — two booked rooms
  // made a slot read as full once ten desks were taken.
  //
  // Thirteen spaces taken out of fourteen leaves one, and the slot must survive.
  it('does not let room bookings exhaust the desk count', () => {
    const bookings = Array.from({ length: ALL_SPACES - 1 }, (_, i) => ({
      deskId: String(i + 1), startMin: AFTERNOON, endMin: OFFICE_END,
    }));

    expect(getAvailableSlots(SLOT_MINUTES, bookings, AFTERNOON, ALL_SPACES, false).length)
      .toBeGreaterThan(0);
    // Against the old desk-only denominator the same thirteen would have
    // reported the office full.
    expect(getAvailableSlots(SLOT_MINUTES, bookings, AFTERNOON, 12, false)).toHaveLength(0);
  });

  it('is full only when nothing is left', () => {
    const bookings = Array.from({ length: ALL_SPACES }, (_, i) => ({
      deskId: String(i + 1), startMin: AFTERNOON, endMin: OFFICE_END,
    }));

    expect(getAvailableSlots(SLOT_MINUTES, bookings, AFTERNOON, ALL_SPACES, false))
      .toHaveLength(0);
  });
});
