const { query } = require('../db');

// Checks a caller-supplied desk before it is used.
//
// Auto-assignment already filters on is_active, so without this the two paths
// disagreed: a desk taken out of service vanished from the floor plan but could
// still be booked by id. An id that does not exist at all reached the database
// and came back as a foreign-key violation, which the client saw as "Internal
// server error".
//
// Missing and retired are reported identically, so the endpoint cannot be used
// to discover which desk ids exist.
async function bookableDeskError(deskId) {
  const { rows } = await query(
    'SELECT desk_id FROM desks WHERE desk_id = $1 AND is_active',
    [deskId]
  );
  return rows.length === 0
    ? 'That desk is not available — it may have been taken out of service.'
    : null;
}

module.exports = { bookableDeskError };
