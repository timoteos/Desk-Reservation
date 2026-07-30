/**
 * @jest-environment node
 */
const { execFileSync } = require('child_process');
const { tooSoonError, BOOKING_LEAD_MINUTES, OFFICE_TZ } = require('./officeHours');

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

test('a UTC host accepts a slot later today', () => {
  const { error } = inNodeUnderUTC(`
    const { tooSoonError } = require('./officeHours');
    const n = new Date();
    const fourThirty = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 16, 30);
    return { error: tooSoonError(fourThirty) };
  `);
  // Null only if the host is reading 4:30pm as Honolulu's, not its own.
  expect(error).toBeNull();
});

test('a slot that has been and gone is refused as past', () => {
  expect(tooSoonError(minutesFromNow(-30))).toMatch(/already passed/);
});

test('a slot inside the lead time is refused, and says why', () => {
  const err = tooSoonError(minutesFromNow(BOOKING_LEAD_MINUTES - 1));
  expect(err).toMatch(new RegExp(`close ${BOOKING_LEAD_MINUTES} minutes before`));
  // Not the "already passed" message — it has not passed, and telling somebody
  // that 11:00 is in the past at 10:56 is simply untrue.
  expect(err).not.toMatch(/already passed/);
});

test('a slot just beyond the lead time is allowed', () => {
  expect(tooSoonError(minutesFromNow(BOOKING_LEAD_MINUTES + 1))).toBeNull();
});
