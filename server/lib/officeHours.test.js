/**
 * @jest-environment node
 */
const { execFileSync } = require('child_process');
const { tooSoonError, SLOT_MINUTES, BOOKING_LEAD_MINUTES, OFFICE_TZ } = require('./officeHours');

const minutesFromNow = (mins) => new Date(Date.now() + mins * 60 * 1000);

// Jest evaluates modules in a sandboxed context whose Date is bound to the
// timezone the runner started in, so assigning process.env.TZ inside the module
// is visible as a value but does not move the clock here. A real server is
// plain Node, where it does. So the timezone behaviour is checked by running
// plain Node, deliberately started as a host would start it.
const inNodeUnderUTC = (script) =>
  JSON.parse(
    execFileSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify((() => {${script}})()))`], {
      env: { ...process.env, TZ: 'UTC' },
      cwd: __dirname,
    }).toString()
  );

test('the module states the office timezone', () => {
  expect(OFFICE_TZ).toBe('Pacific/Honolulu');
});

test('a UTC host still runs on the office clock', () => {
  // The bug: Render runs UTC, so `new Date(y, m, d, 15, 0)` meant 3pm UTC —
  // five in the morning in Honolulu, already past — and every slot in the
  // working day was refused from 7am Hawaii time onwards.
  const { tz, offset } = inNodeUnderUTC(`
    require('./officeHours');
    return { tz: process.env.TZ, offset: new Date().getTimezoneOffset() };
  `);
  expect(tz).toBe('Pacific/Honolulu');
  expect(offset).toBe(600); // UTC-10, and Hawaii has no daylight saving
});

test('a UTC host builds a wall-clock time as Honolulu meant it', () => {
  // Asserted as an instant rather than as "is this bookable", which was the
  // first version and depended on the wall clock of whoever ran it: it passed
  // all day and failed every evening after half past four. A test that only
  // holds during office hours is not testing the thing it claims to.
  const { iso } = inNodeUnderUTC(`
    require('./officeHours');
    const d = new Date(2026, 6, 30, 16, 30);   // 30 July, half past four
    return { iso: d.toISOString() };
  `);

  // Half past four in Honolulu is half past two the next morning, UTC.
  expect(iso).toBe('2026-07-31T02:30:00.000Z');
});

test('a slot that has been and gone is refused as past', () => {
  expect(tooSoonError(minutesFromNow(-30))).toMatch(/already passed/);
});

const CLOSES_AFTER = SLOT_MINUTES - BOOKING_LEAD_MINUTES;  // 25 minutes in

// The slot you are standing in is bookable. Somebody arriving at 10:01 wants
// the half hour that is running, and a desk sitting empty in front of them is
// not a thing to be told to wait for.
test('the slot already in progress is still claimable', () => {
  expect(tooSoonError(minutesFromNow(-1))).toBeNull();
  expect(tooSoonError(minutesFromNow(-(CLOSES_AFTER - 1)))).toBeNull();
});

// The boundary, which is the whole rule: five minutes before the slot ends it
// shuts, so 10:00 is gone at 10:25 rather than at 10:30.
test('a slot shuts five minutes before it ends', () => {
  expect(tooSoonError(minutesFromNow(-CLOSES_AFTER))).toMatch(/already passed/);
  expect(tooSoonError(minutesFromNow(-SLOT_MINUTES))).toMatch(/already passed/);
});

// The lead is measured from the end of the slot, so it never blocks one that
// has not started. The old rule closed 11:00 at 10:56 and left a four-minute
// hole where neither slot could be taken.
test('a slot that has not started is never too soon', () => {
  expect(tooSoonError(minutesFromNow(1))).toBeNull();
  expect(tooSoonError(minutesFromNow(4))).toBeNull();
});

// The rule is about the slot a booking starts in, not how long it runs, so a
// two-hour booking from 10:00 is judged exactly as a half-hour one is.
test('the answer does not depend on how long was asked for', () => {
  expect(tooSoonError(minutesFromNow(-(CLOSES_AFTER - 1)))).toBeNull();
  expect(tooSoonError(minutesFromNow(-(CLOSES_AFTER + 1)))).toMatch(/already passed/);
});
