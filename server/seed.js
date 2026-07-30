// Populates the database with the same fixtures the frontend mock files use,
// so the app behaves identically once pages are wired to the API.
//
//   npm run seed        local fixtures, real colleagues' names, laptop only
//   npm run seed:demo   invented people on example.com, safe to publish
//
// This script begins by TRUNCATEing every table, which is what a fixture loader
// should do and is catastrophic pointed at the wrong database. Both guards below
// exist because the only thing standing between the two is an environment
// variable that is easy to leave set in a shell.
require('dotenv').config();
const { pool, query } = require('./db');
const { generateConfirmationCode } = require('./lib/reservationShape');
const { hashPassword } = require('./lib/auth');
const { seedActivities } = require('./lib/activityLog');
const { datasetFor, emailFor } = require('./seedPeople');

const MODE = process.argv.includes('--demo') || process.env.SEED_MODE === 'demo'
  ? 'demo'
  : 'local';

const dataset = datasetFor(MODE);
const USERS = dataset.people;
const ADMIN = dataset.admin;
const RESERVATIONS = dataset.reservations;

// A development fixture, not a credential. It only ever exists in a local
// database — a reachable deployment has to supply its own, because a password
// committed to a public repository protects nothing.
const DEV_ADMIN_PASSWORD = 'mqd-dev-admin';

const adminPassword = () => {
  if (MODE === 'local') return DEV_ADMIN_PASSWORD;
  const supplied = process.env.DEMO_ADMIN_PASSWORD;
  if (!supplied) {
    throw new Error(
      'DEMO_ADMIN_PASSWORD is not set. A published demo cannot use the password '
      + 'that is written in this file — anyone reading the repository would be an '
      + 'administrator on it.'
    );
  }
  return supplied;
};

// Anything that is not a loopback host is somebody else's data.
const isLocalDatabase = (url) => {
  if (!url) return true;                       // unix socket, local by definition
  try {
    const { hostname } = new URL(url);
    return ['localhost', '127.0.0.1', '::1', ''].includes(hostname);
  } catch {
    return false;                              // unparseable: assume the worst
  }
};

// Host only — never the whole URL, which carries the password.
const describeTarget = () => {
  const url = process.env.DATABASE_URL;
  if (!url) return 'local socket (no DATABASE_URL set)';
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname || 'local socket'}${pathname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
};

function assertSafeTarget() {
  const url = process.env.DATABASE_URL;
  if (isLocalDatabase(url) || process.env.ALLOW_REMOTE_SEED === '1') return;

  const { hostname } = new URL(url);
  throw new Error(
    `Refusing to seed ${hostname}: this script truncates every table.\n`
    + '  If that is genuinely what you want, re-run with ALLOW_REMOTE_SEED=1.'
  );
}

// Same bookings as src/data/mockReservations.js, relative to today.
const dayOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
};

const at = (base, minutes) => {
  const d = new Date(base);
  d.setMinutes(minutes);
  return d;
};

async function seed() {
  // Everything that can refuse must refuse before the TRUNCATE.
  //
  // adminPassword() used to be called further down, next to where the hash is
  // needed — which read naturally and meant a run missing DEMO_ADMIN_PASSWORD
  // emptied the database and only then complained. A validation that fires after
  // the destructive step is not a validation, it is an epitaph. This wiped a
  // working local database exactly once, which was one time too many.
  assertSafeTarget();
  const password = adminPassword();

  // Name the target before emptying it. The guards above cover the cases they
  // can test for; this covers the one they cannot — a correct-looking command
  // pointed at the wrong database, which is only obvious to the person reading.
  console.log(`Target:  ${describeTarget()}`);
  console.log(`Seeding ${MODE} fixtures (${USERS.length} people, @${dataset.domain})`);

  await query(
    'TRUNCATE logs, reservations, recurring_schedules, users, desks, roles RESTART IDENTITY CASCADE'
  );
  console.log('Cleared existing data');

  const roleIds = {};
  for (const roleType of ['member', 'admin', 'guest']) {
    const { rows } = await query(
      'INSERT INTO roles (role_type) VALUES ($1) RETURNING role_id',
      [roleType]
    );
    roleIds[roleType] = rows[0].role_id;
  }
  console.log('Inserted 3 roles');

  await seedActivities();
  console.log('Inserted activity types');

  const adminHash = await hashPassword(password);

  const userIds = {};
  for (const [first, last] of USERS) {
    const fullName = `${first} ${last}`;
    const isAdmin = fullName === ADMIN;
    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, role_id, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
      [
        first,
        last,
        emailFor(dataset, first, last),
        roleIds[isAdmin ? 'admin' : 'member'],
        // Only the admin can sign in; members book by email and have no
        // password until SSO or self-registration exists.
        isAdmin ? adminHash : null,
      ]
    );
    userIds[fullName] = rows[0].user_id;
  }
  console.log(`Inserted ${USERS.length} users`);

  const deskIds = {};
  for (let number = 1; number <= 12; number += 1) {
    const { rows } = await query(
      'INSERT INTO desks (desk_number) VALUES ($1) RETURNING desk_id',
      [number]
    );
    deskIds[number] = rows[0].desk_id;
  }
  console.log('Inserted 12 desks');

  for (const r of RESERVATIONS) {
    const base = dayOffset(r.dayOffset);
    await query(
      // Approved, not pending: these represent bookings that already exist, so
      // the calendar shows realistic occupancy. Pending would put five requests
      // nobody made into the approval queue.
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code, status)
       VALUES ($1, $2, $3, $4, $5, 'approved')`,
      [
        userIds[r.name],
        deskIds[r.deskNumber],
        at(base, r.startMin),
        at(base, r.endMin),
        generateConfirmationCode(),
      ]
    );
  }
  console.log(`Inserted ${RESERVATIONS.length} reservations`);

  const { rows } = await query(
    `SELECT u.first_name || ' ' || u.last_name AS name, r.confirmation_code
       FROM reservations r JOIN users u ON u.user_id = r.user_id
      ORDER BY r.starts_at`
  );
  console.log('\nConfirmation codes for testing:');
  rows.forEach((row) => console.log(`  ${row.confirmation_code}  ${row.name}`));

  const [adminFirst, adminLast] = ADMIN.split(' ');
  console.log('\nAdmin sign-in:');
  console.log(`  ${emailFor(dataset, adminFirst, adminLast)}`);
  console.log(MODE === 'demo'
    ? '  (the DEMO_ADMIN_PASSWORD you supplied)'
    : `  ${password}`);
}

seed()
  .then(() => pool.end())
  .then(() => console.log('\nDone seeding.'))
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
