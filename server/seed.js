// Populates the database with the same fixtures the frontend mock files use,
// so the app behaves identically once pages are wired to the API.
//
// Run with: npm run seed
require('dotenv').config();
const { pool, query } = require('./db');
const { generateConfirmationCode } = require('./lib/reservationShape');

const USERS = [
  ['Angello', 'Portillo'], ['Keanu', 'Ishihara'], ['Timoteo', 'Sumalinog'],
  ['Michael', 'Barbieto'], ['Penny', 'Kabua'], ['Mark', 'Burgess'],
  ['Rafael', 'Abitz'], ['Megan', 'Yamamoto'], ['Steve', 'Elias'],
  ['Cacie', 'Sonomura'], ['Travis', 'Quensenberry'], ['Keith', 'Bangi'],
  ['Phan', 'Sirivattha'], ['Rhona', 'Ramos'], ['Michael', 'Mau'],
  ['Marivic', 'Baitalon'],
];

const ADMIN = 'Timoteo Sumalinog';

const emailFor = (first, last) =>
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
  await query('TRUNCATE reservations, users, desks, roles RESTART IDENTITY CASCADE');
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

  const userIds = {};
  for (const [first, last] of USERS) {
    const fullName = `${first} ${last}`;
    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, role_id)
       VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [first, last, emailFor(first, last), roleIds[fullName === ADMIN ? 'admin' : 'member']]
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
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code)
       VALUES ($1, $2, $3, $4, $5)`,
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
}

seed()
  .then(() => pool.end())
  .then(() => console.log('\nDone seeding.'))
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
