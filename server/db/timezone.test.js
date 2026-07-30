/**
 * @jest-environment node
 */
const { OFFICE_TZ } = require('../lib/officeHours');

// No connection is made here — constructing a Pool does not dial out — so this
// runs anywhere. It guards the configuration, which is the part that was wrong.
const { pool } = require('./index');

test('the connection pool pins the session to the office timezone', () => {
  // starts_at and ends_at are `timestamp without time zone`, and a dozen queries
  // compare them to now(). Postgres casts the naive value using the session's
  // timezone, so a GMT session read a booking ending at 13:00 in Honolulu as
  // 13:00 GMT — long past — and today's bookings vanished from the admin's
  // upcoming list while the by-date query still found them.
  expect(pool.options.options).toBe(`-c timezone=${OFFICE_TZ}`);
});

test('the office timezone is one value, shared by the clock and the database', () => {
  // Two halves of the same fix. Setting one and not the other is what left the
  // SQL comparisons wrong after the Node-side comparisons were corrected.
  expect(process.env.TZ).toBe(OFFICE_TZ);
  expect(pool.options.options).toContain(OFFICE_TZ);
});
