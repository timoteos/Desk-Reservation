// Translates between the database's timestamp columns and the shape the React
// pages already expect ({ date, startMin, endMin }). Keeping this conversion at
// the API boundary means the frontend never sees database field names, and the
// storage model can change without touching a component.

const pad = (n) => String(n).padStart(2, '0');

// Local calendar date as YYYY-MM-DD. Avoids toISOString(), which shifts to UTC
// and can roll an early-morning Hawaii reservation onto the previous day.
const toDateString = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toMinutes = (d) => d.getHours() * 60 + d.getMinutes();

// Database row -> API response
const rowToReservation = (row) => ({
  id: String(row.reservation_id),
  date: toDateString(row.starts_at),
  startMin: toMinutes(row.starts_at),
  endMin: toMinutes(row.ends_at),
  status: row.status,
  confirmationCode: row.confirmation_code,
  bookingSource: row.booking_source,
  // Present only on recurring occurrences. scheduleId is the single weekday this
  // booking came from; seriesId identifies the whole submission, which is what
  // the interface groups on so a Mon/Wed/Fri pattern reads as one entry.
  scheduleId: row.schedule_id != null ? String(row.schedule_id) : null,
  seriesId: row.series_id != null ? String(row.series_id) : null,
  user: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
  userId: row.user_id,
  deskNumber: row.desk_number,
  deskId: row.desk_id,
});

// API request ({ date, startMin, endMin }) -> timestamps for the database
const toTimestamps = (date, startMin, endMin) => {
  const [year, month, day] = date.split('-').map(Number);
  const startsAt = new Date(year, month - 1, day, Math.floor(startMin / 60), startMin % 60);
  const endsAt = new Date(year, month - 1, day, Math.floor(endMin / 60), endMin % 60);
  return { startsAt, endsAt };
};

// Unambiguous alphabet: no 0/O or 1/I/L, so codes survive being read aloud or
// copied off a printout.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const generateConfirmationCode = (length = 8) => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
};

// A code that exists in neither table.
//
// Booking codes live on reservations and schedule codes on recurring_schedules,
// so there are two unique constraints and neither can see the other. Eight
// characters of a 31-letter alphabet make a collision vanishingly unlikely, but
// "unlikely" is the wrong guarantee for the value a person reads out at the desk
// to check in: one collision would make a code ambiguous between somebody's
// Tuesday booking and somebody else's whole schedule. Cheaper to ask.
async function generateUniqueCode(client, { length = 8, attempts = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const code = generateConfirmationCode(length);
    const { rows } = await client.query(
      `SELECT 1 FROM reservations WHERE confirmation_code = $1
        UNION ALL
       SELECT 1 FROM recurring_schedules WHERE series_code = $1
       LIMIT 1`,
      [code]
    );
    if (rows.length === 0) return code;
  }
  // Ten collisions in a row means the alphabet is exhausted or something is
  // badly wrong; failing loudly beats returning a duplicate.
  throw new Error('Could not generate an unused confirmation code.');
}

module.exports = {
  rowToReservation,
  toTimestamps,
  generateConfirmationCode,
  generateUniqueCode,
  toDateString,
};
