// One-off script to port the frontend's mock data into real MongoDB documents.
// Run with: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Desk = require('./models/Desk');
const Reservation = require('./models/Reservation');

const slugEmail = (name) =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@dhs.hawaii.gov`;

const mockUserNames = [
  'Angello Portillo', 'Keanu Ishihara', 'Timoteo Sumalinog', 'Michael Barbieto',
  'Penny Kabua', 'Mark Burgess', 'Rafael Abitz', 'Megan Yamamoto',
  'Steve Elias', 'Cacie Sonomura', 'Travis Quensenberry', 'Keith Bangi',
  'Phan Sirivattha', 'Rhona Ramos', 'Michael Mau', 'Marivic Baitalon',
];

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const dayAfter = new Date(today);
dayAfter.setDate(today.getDate() + 2);

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await Promise.all([
    User.deleteMany({}),
    Desk.deleteMany({}),
    Reservation.deleteMany({}),
  ]);
  console.log('Cleared existing users, desks, and reservations');

  const users = await User.insertMany(
    mockUserNames.map((name, i) => ({
      name,
      email: slugEmail(name),
      role: i === 2 ? 'admin' : 'user', // Timoteo Sumalinog as the seeded admin
    }))
  );
  console.log(`Inserted ${users.length} users`);

  const desks = await Desk.insertMany(
    Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      label: `Desk# ${i + 1}`,
      location: 'MQD System Office',
    }))
  );
  console.log(`Inserted ${desks.length} desks`);

  const byName = Object.fromEntries(users.map((u) => [u.name, u]));

  const reservationSeeds = [
    { code: '1', name: 'Keanu Ishihara', deskNumber: 1, date: fmt(today), startMin: 600, endMin: 690 },
    { code: '2', name: 'Penny Kabua', deskNumber: 2, date: fmt(tomorrow), startMin: 540, endMin: 600 },
    { code: '3', name: 'Megan Yamamoto', deskNumber: 3, date: fmt(tomorrow), startMin: 780, endMin: 900 },
    { code: '4', name: 'Angello Portillo', deskNumber: 4, date: fmt(dayAfter), startMin: 480, endMin: 720 },
    { code: '5', name: 'Rafael Abitz', deskNumber: 5, date: fmt(dayAfter), startMin: 810, endMin: 990 },
  ];

  const reservations = await Reservation.insertMany(
    reservationSeeds.map((r) => ({
      user: byName[r.name]._id,
      desk: desks[r.deskNumber - 1]._id,
      date: r.date,
      startMin: r.startMin,
      endMin: r.endMin,
      confirmationCode: r.code,
    }))
  );
  console.log(`Inserted ${reservations.length} reservations`);

  await mongoose.disconnect();
  console.log('Done seeding.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
