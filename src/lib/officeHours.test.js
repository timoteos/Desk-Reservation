import { earliestStartOn, BOOKING_LEAD_MINUTES, OFFICE_START, SLOT_MINUTES } from './officeHours';

// Freeze the clock at a wall-clock time today, so "today" and "now" agree.
const atLocalTime = (hh, mm) => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  jest.setSystemTime(d);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a slot stays claimable until the lead time, then closes', () => {
  // The rule people actually asked for: an 11:00 desk can be taken at 10:55 but
  // not at 10:56, rather than staying open until 11:00 exactly.
  const today = atLocalTime(10, 55);
  expect(earliestStartOn(today)).toBe(11 * 60);

  atLocalTime(10, 56);
  expect(earliestStartOn(today)).toBe(11 * 60 + SLOT_MINUTES);
});

test('the lead time is what closes it, not the slot boundary', () => {
  const today = atLocalTime(10, 60 - BOOKING_LEAD_MINUTES - 1);
  expect(earliestStartOn(today)).toBe(11 * 60);
});

test('a future date offers the whole day regardless of the time now', () => {
  atLocalTime(16, 30);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  expect(earliestStartOn(tomorrow)).toBe(OFFICE_START);
});

test('before the office opens, the day starts at opening', () => {
  const today = atLocalTime(6, 0);
  expect(earliestStartOn(today)).toBe(OFFICE_START);
});
