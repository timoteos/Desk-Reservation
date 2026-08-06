import {
  earliestStartOn, BOOKING_LEAD_MINUTES, OFFICE_START, SLOT_MINUTES,
  formatDuration, MINS_IN_WORKDAY,
} from './officeHours';

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

// Bookings step by the half hour, so a duration is no longer always a whole
// number of hours. The expression this replaced divided by 60 and appended an
// "s", which read "1.5 hours" the moment half-hour steps arrived.
describe('formatDuration', () => {
  it.each([
    [30, '30 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 minutes'],
    [120, '2 hours'],
    [150, '2 hours 30 minutes'],
    [480, '8 hours'],
  ])('%i minutes reads as "%s"', (mins, expected) => {
    expect(formatDuration(mins)).toBe(expected);
  });

  it('says "1 hour", not "1 hours"', () => {
    expect(formatDuration(60)).not.toMatch(/hours/);
  });

  it('never renders a fraction at any step of the day', () => {
    for (let m = SLOT_MINUTES; m <= MINS_IN_WORKDAY; m += SLOT_MINUTES) {
      expect(formatDuration(m)).not.toMatch(/\./);
    }
  });

  it('does not return an empty string for zero', () => {
    expect(formatDuration(0)).toBe('0 minutes');
  });
});

describe('the office day divides into half hours', () => {
  // The stepper counts half hours and caps at the working day. If these stop
  // dividing evenly the top of the range becomes unreachable.
  it('leaves no remainder', () => {
    expect(MINS_IN_WORKDAY % SLOT_MINUTES).toBe(0);
  });

  it('reaches a full office day as its ceiling', () => {
    expect(formatDuration(MINS_IN_WORKDAY)).toBe('9 hours 30 minutes');
  });
});
