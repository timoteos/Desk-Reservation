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
// Azure Postgres refuses an unencrypted connection, and node-postgres does not
// read `sslmode` out of the connection string the way psql does — it parses the
// URL itself and ignores that parameter. So a URL psql connects with happily
// arrives here in plaintext and is turned away. The error is "no pg_hba.conf
// entry for host ... no encryption", which reads like a firewall rule and sends
// you to the networking blade for an hour. It is this line instead.
//
// Inferred rather than configured, so no deploy depends on remembering a flag.
// A Unix socket or localhost is the machine talking to itself and needs no TLS;
// anything reached over a network gets it.
const url = process.env.DATABASE_URL || '';
const isLocal =
  url === '' ||
  !url.includes('@') || // socket form: postgresql:///desk_reservation
  /@(localhost|127\.0\.0\.1)([:/]|$)/.test(url);

// Certificate verification stays ON. Azure serves a certificate from a public
// CA that Node already trusts, so this needs no bundle and no configuration —
// and disabling it, which most guides suggest as a first move, throws away the
// half of TLS that proves you are talking to your own database rather than to
// whoever answered. DATABASE_SSL is the escape hatch for a self-hosted server
// with a self-signed certificate: 'off' disables TLS, 'insecure' keeps the
// encryption and drops the identity check.
const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
const ssl =
  sslMode === 'off' ? false
  : sslMode === 'insecure' ? { rejectUnauthorized: false }
  : sslMode === 'on' || !isLocal ? { rejectUnauthorized: true }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${OFFICE_TZ}`,
  ssl,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

// Thin wrapper so routes never touch the pool directly.
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
