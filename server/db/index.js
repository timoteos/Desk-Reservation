const { Pool } = require('pg');

// Local development connects over a Unix socket as the current macOS user, so
// DATABASE_URL carries no password. Production would supply a full URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

// Thin wrapper so routes never touch the pool directly.
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
