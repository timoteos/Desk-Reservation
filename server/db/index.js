const { Pool } = require('pg');
const { OFFICE_TZ } = require('../lib/officeHours');

// Local development connects over a Unix socket as the current macOS user, so
// DATABASE_URL carries no password. Production would supply a full URL.
//
// The session timezone is the database half of running on the office's clock,
// and it is not optional. starts_at and ends_at are `timestamp without time
// zone` — wall clock, no offset — and a dozen queries compare them to now().
// Postgres resolves that by casting the naive value using the session's
// timezone, so on a GMT session a booking ending at 13:00 in Honolulu is read
// as 13:00 GMT, three in the morning local, and reported as long past. Today's
// bookings simply disappeared from the admin's upcoming list.
//
// Passed as a startup parameter rather than a `SET TIME ZONE` on the connect
// event, so it is in force before the connection can be handed to a query.
// Locally this changes nothing: the server's own zone is already Honolulu.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${OFFICE_TZ}`,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

// Thin wrapper so routes never touch the pool directly.
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
