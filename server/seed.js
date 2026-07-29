// Populates the database with the same fixtures the frontend mock files use,
// so the app behaves identically once pages are wired to the API.
//
// Run with: npm run seed
require('dotenv').config();
const { pool, query } = require('./db');
const { generateConfirmationCode } = require('./lib/reservationShape');
const { hashPassword } = require('./lib/auth');
const { seedActivities } = require('./lib/activityLog');

// A development fixture, not a credential. Printed on seed so it's findable,
// and it only ever exists in a local database. Any real deployment must set a
// different password before the account is reachable.
const DEV_ADMIN_PASSWORD = 'mqd-dev-admin';

const USERS = [
  ['Angello', 'Portillo'], ['Keanu', 'Ishihara'], ['Timoteo', 'Sumalinog'],
  ['Michael', 'Barbieto'], ['Penny', 'Kabua'], ['Mark', 'Burgess'],
  ['Rafael', 'Abitz'], ['Megan', 'Yamamoto'], ['Steve', 'Elias'],
  ['Cacie', 'Sonomura'], ['Travis', 'Quensenberry'], ['Keith', 'Bangi'],
  ['Phan', 'Sirivattha'], ['Rhona', 'Ramos'], ['Michael', 'Mau'],
  ['Marivic', 'Baitalon'],
];

const ADMIN = 'Timoteo Sumalinog';

// Accounts whose address doesn't follow the first.last convention.
const EMAIL_OVERRIDES = {
  'Timoteo Sumalinog': 'tsumalinog-int@dhs.hawaii.gov',
};

const emailFor = (first, last) =>
  EMAIL_OVERRIDES[`${first} ${last}`] ||
  `${first.toLowerCase()}.${last.toLowerCase()}@dhs.hawaii.gov`;

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

const RESERVATIONS = [
  { name: 'Keanu Ishihara',   deskNumber: 1, dayOffset: 0, startMin: 600, endMin: 690 },
  { name: 'Penny Kabua',      deskNumber: 2, dayOffset: 1, startMin: 540, endMin: 600 },
  { name: 'Megan Yamamoto',   deskNumber: 3, dayOffset: 1, startMin: 780, endMin: 900 },
  { name: 'Angello Portillo', deskNumber: 4, dayOffset: 2, startMin: 480, endMin: 720 },
  { name: 'Rafael Abitz',     deskNumber: 5, dayOffset: 2, startMin: 810, endMin: 990 },
];

async function seed() {
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

  const adminHash = await hashPassword(DEV_ADMIN_PASSWORD);

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
        emailFor(first, last),
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

  console.log('\nAdmin sign-in (development fixture — change before any real use):');
  console.log(`  ${EMAIL_OVERRIDES[ADMIN]}`);
  console.log(`  ${DEV_ADMIN_PASSWORD}`);
}

seed()
  .then(() => pool.end())
  .then(() => console.log('\nDone seeding.'))
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
