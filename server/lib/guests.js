// External visitors: validating them, and turning one into a user row.
//
// One module because two surfaces now create guests — an administrator booking
// on somebody's behalf, and the front desk signing a visitor in — and the rules
// are not the sort that survive being written twice. "That address belongs to
// staff", the race on a duplicate email, the reuse of a returning visitor: each
// is a decision, and a second copy of them would drift.
//
// Nothing here commits or rolls back. The caller owns the transaction, because
// creating a visitor is always half of something larger and the two must land
// together.

// What has to be true before anybody can vouch for a visitor.
//
// An address is required because the confirmation code is the only way a guest
// can ever reach their booking — this is an internal application and they have
// no other way in — so a visitor with no address has no route to their own desk.
function guestDetailsError(guest) {
  const has = (v) => typeof v === 'string' && v.trim().length > 0;

  if (!guest || typeof guest !== 'object') return 'Visitor details are required.';
  if (!has(guest.firstName) || !has(guest.lastName)) {
    return 'A visitor needs a first and last name.';
  }
  if (!has(guest.email)) {
    return 'A visitor needs an email address — it is the only way they can reach their booking.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) {
    return 'That email address does not look right.';
  }
  return null;
}

// Finds or creates the visitor, returning either { ok: true, user } or
// { ok: false, status, message } for the caller to answer with.
//
// `createdBy` is who added the account, which is a different question from who
// sponsors a particular visit — that is recorded on the booking.
async function resolveGuest(client, guest, createdBy) {
  const email = guest.email.trim();

  // Case-insensitively, because the unique index is on the literal string and
  // "Ana@acme.test" would otherwise become a second account for one person.
  const findExisting = () => client.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.organization, r.role_type
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );

  // Reuse a returning visitor; refuse a colleague, because signing a member of
  // staff in through the visitor path would record a sponsor for somebody who
  // needs none and file them under external in the history.
  const accept = (row) =>
    row.role_type === 'guest'
      ? { ok: true, user: row }
      : {
          ok: false,
          status: 409,
          message: `${email} belongs to ${row.first_name} ${row.last_name}, who is staff. They can sign in with their own booking.`,
        };

  const existing = await findExisting();
  if (existing.rows.length > 0) return accept(existing.rows[0]);

  // ON CONFLICT rather than a bare INSERT, because the check above and this
  // write are not one atomic step: two people signing the same new visitor in
  // at the same moment both found nothing, both inserted, and the loser hit the
  // unique index and fell through to a 500. It now waits for the other
  // transaction, does nothing, and reads the row that transaction committed.
  const created = await client.query(
    `INSERT INTO users (first_name, last_name, email, organization,
                        role_id, created_by_user_id, password_hash)
     VALUES ($1, $2, $3, $4,
             (SELECT role_id FROM roles WHERE role_type = 'guest'), $5, NULL)
     ON CONFLICT (email) DO NOTHING
     RETURNING user_id, first_name, last_name, organization`,
    [
      guest.firstName.trim(),
      guest.lastName.trim(),
      email,
      guest.organization?.trim() || null,
      createdBy ?? null,
    ]
  );

  if (created.rows.length > 0) {
    return { ok: true, user: { ...created.rows[0], role_type: 'guest' } };
  }

  const raced = await findExisting();
  if (raced.rows.length === 0) {
    return { ok: false, status: 409, message: 'That visitor could not be created. Try again.' };
  }
  return accept(raced.rows[0]);
}

module.exports = { guestDetailsError, resolveGuest };
