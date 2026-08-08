const { query } = require('../db');

// Everything the application books: desks, and now conference rooms. One table,
// one exclusion constraint, one booking path — what differs is the type on the
// row and the way it is chosen.
//
// The rule this module exists to enforce: **resourceType is always required and
// never defaults.** A default of 'desk' would let every call site that nobody
// remembered to update keep working, and would turn the one place somebody
// forgets to pass 'room' into a silent wrong answer instead of a failure.
//
// That distinction is not theoretical here. The front desk showing a pending
// booking as a free desk, and check-in admitting an expired request, were both
// filters that had to be remembered at a call site and were not. A scattered
// `WHERE resource_type = 'desk'` is the same shape. This is the mitigation.

const RESOURCE_TYPES = ['desk', 'room'];

// 'all' is a way of *looking* at the floor, never a way of booking on it.
//
// The map shows one office, so it lists both kinds together. Assigning one
// cannot: "book me anything free" has to resolve to a desk or a room, and a
// pool containing both would pick for the person — occasionally handing a
// ten-seat conference room to somebody who wanted a desk for the afternoon.
//
// So it is allowed here and refused by assertResourceType, which every booking
// path goes through. The separation is the safeguard, not a nicety.
const LISTABLE_TYPES = [...RESOURCE_TYPES, 'all'];

function assertListableType(type) {
  if (!LISTABLE_TYPES.includes(type)) {
    throw new TypeError(
      `type is required and must be one of ${LISTABLE_TYPES.join(', ')} — received ${JSON.stringify(type)}`
    );
  }
  return type;
}

// The nouns people actually use, for messages. A room told it "is not
// available — it may have been taken out of service" reads as a desk fault.
const NOUNS = { desk: 'desk', room: 'conference room' };

function assertResourceType(resourceType) {
  if (!RESOURCE_TYPES.includes(resourceType)) {
    // Thrown rather than returned: a missing type is a programming mistake, not
    // a bad request, and it must not be possible to swallow it into a default.
    throw new TypeError(
      `resourceType is required and must be one of ${RESOURCE_TYPES.join(', ')} — received ${JSON.stringify(resourceType)}`
    );
  }
  return resourceType;
}

function nounFor(resourceType) {
  return NOUNS[assertResourceType(resourceType)];
}

// Every function here takes an optional transaction client, so a caller part
// way through a transaction reads its own uncommitted rows rather than the
// pool's view of the world.
const runnerFor = (client) => (client ? (text, params) => client.query(text, params) : query);

// Who may hold a booking of each type.
//
// A conference room is answerable to somebody with an MQD account. An external
// visitor can sit in the meeting — they are simply not the person the room is
// booked to, which is the same principle the desk rule already applies from the
// other side: a guest may hold a desk, but only with a member of staff recorded
// as sponsoring the visit.
//
// This does not wait for SSO. SSO changes how a person proves who they are, not
// what their role is allowed to do: staff will authenticate against DHS and
// keep 'member' or 'admin', and a guest stays a guest with no way to sign in at
// all. The role this rule reads already exists and is already correct, so
// deferring would mean shipping rooms a visitor can book and taking it away
// afterwards.
const ROLES_THAT_MAY_BOOK = {
  desk: ['member', 'admin', 'guest'],
  room: ['member', 'admin'],
};

function bookingRoleError(resourceType, roleType) {
  assertResourceType(resourceType);
  if (ROLES_THAT_MAY_BOOK[resourceType].includes(roleType)) return null;
  return resourceType === 'room'
    ? 'Conference rooms can only be booked by MQD staff. An external visitor can attend, but the room has to be booked by the person they are here to see.'
    : `That booking cannot be made for a ${roleType}.`;
}

// The one place a default belongs: at the HTTP boundary, stated once where it
// is visible. A caller written before rooms existed keeps booking desks, while
// everything inside the query layer stays strict.
//
// Returns null for a type that does not exist, so the route answers 400 rather
// than quietly booking a desk for somebody who asked for something else.
function resourceTypeFromRequest(value) {
  const requested = value ?? 'desk';
  return RESOURCE_TYPES.includes(requested) ? requested : null;
}

// The same, for the read-only endpoints, where 'all' is a legitimate answer.
function listableTypeFromRequest(value) {
  const requested = value ?? 'desk';
  return LISTABLE_TYPES.includes(requested) ? requested : null;
}

// Every resource has two names, and which one is right depends on the space
// available rather than on the caller's preference.
//
//   labelFor      "Desk# 4", "Conference Room 511A"   — prose: lists, logs,
//                                                       confirmations, anywhere
//                                                       a sentence names it
//   shortLabelFor "4", "511A"                         — the floor plan, where a
//                                                       marker is a token and a
//                                                       full name does not fit
//
// Both derive from the row so they cannot drift apart, and neither is built by
// slicing the other.
function labelFor(row) {
  return row.display_name ?? `Desk# ${row.desk_number}`;
}

function shortLabelFor(row) {
  return row.short_name ?? String(row.desk_number);
}

// The prose label in SQL, for the queries that join to a resource purely to
// show what it is called. Aliased as desk_label by every caller, so the API
// shape carries a name rather than leaving each screen to rebuild one from a
// number — which is how a conference room ends up reading as "Desk# 13".
const LABEL_SQL = "coalesce(d.display_name, 'Desk# ' || d.desk_number)";

// Everything in service, of one type or of both. Listing only — see
// LISTABLE_TYPES for why 'all' stops here and never reaches a booking path.
async function listResources(type, client = null) {
  assertListableType(type);
  const { rows } = await runnerFor(client)(
    `SELECT desk_id, desk_number, display_name, short_name, capacity, is_active, resource_type
       FROM desks
      WHERE is_active AND ($1 = 'all' OR resource_type = $1)
      -- Desks first, then rooms, each in number order: the floor plan reads
      -- left to right and the list beside it should match.
      ORDER BY resource_type = 'room', desk_number`,
    [type]
  );
  return rows;
}

// Nothing was chosen, so pick something free for the window.
//
// Random rather than lowest-numbered so bookings spread across the office
// instead of piling onto Desk# 1.
//
// This replaces two copies of the same query — one in the reservations route,
// one in the requests route — which is the strongest argument for the module:
// it removes a duplication that already existed rather than adding indirection
// for a hypothetical future type.
async function findAvailableResource(resourceType, startsAt, endsAt, client = null) {
  assertResourceType(resourceType);
  const { rows } = await runnerFor(client)(
    `SELECT desk_id FROM desks d
      WHERE d.is_active
        AND d.resource_type = $3
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
           WHERE r.desk_id = d.desk_id
             AND r.status IN ('pending', 'approved')
             AND tsrange(r.starts_at, r.ends_at) && tsrange($1, $2)
        )
      ORDER BY random()
      LIMIT 1`,
    [startsAt, endsAt, resourceType]
  );
  return rows[0]?.desk_id ?? null;
}

// Checks a caller-supplied id before it is used.
//
// Auto-assignment already filters on is_active, so without this the two paths
// disagreed: a desk taken out of service vanished from the floor plan but could
// still be booked by id. An id that does not exist at all reached the database
// and came back as a foreign-key violation, which the client saw as "Internal
// server error".
//
// It now checks the type as well. Without that, a conference room could be
// booked straight through the desk flow by passing its id — the toggle in the
// interface is a convenience, not a control, and anything that decides what may
// be booked has to hold on the server.
//
// Missing, retired and wrong-type are reported identically, so the endpoint
// cannot be used to discover which ids exist or what they are.
async function bookableResourceError(resourceType, deskId, client = null) {
  assertResourceType(resourceType);
  const { rows } = await runnerFor(client)(
    'SELECT desk_id FROM desks WHERE desk_id = $1 AND is_active AND resource_type = $2',
    [deskId, resourceType]
  );
  return rows.length === 0
    ? `That ${nounFor(resourceType)} is not available — it may have been taken out of service.`
    : null;
}

// What kind of thing is this, and is it bookable at all?
//
// Used by the booking routes when a caller names a specific resource. The type
// is read from the row rather than taken from the request: a client that says
// "this is a desk" while passing a room's id would otherwise pick which rules
// it is judged by, and the rules are the whole point.
//
// Returns null for an id that does not exist or is out of service, so callers
// report both the same way and the endpoint cannot be used to enumerate ids.
async function activeResourceById(deskId, client = null) {
  const { rows } = await runnerFor(client)(
    `SELECT desk_id, desk_number, display_name, short_name, capacity, resource_type
       FROM desks
      WHERE desk_id = $1 AND is_active`,
    [deskId]
  );
  return rows[0] ?? null;
}

// The front desk claims by the number on the desk, not by an internal id.
async function resourceByNumber(resourceType, deskNumber, client = null) {
  assertResourceType(resourceType);
  const { rows } = await runnerFor(client)(
    `SELECT desk_id, desk_number, display_name, short_name, capacity, resource_type
       FROM desks
      WHERE desk_number = $1 AND is_active AND resource_type = $2`,
    [deskNumber, resourceType]
  );
  return rows[0] ?? null;
}

module.exports = {
  RESOURCE_TYPES,
  LISTABLE_TYPES,
  ROLES_THAT_MAY_BOOK,
  LABEL_SQL,
  assertResourceType,
  assertListableType,
  bookingRoleError,
  nounFor,
  labelFor,
  shortLabelFor,
  listResources,
  findAvailableResource,
  bookableResourceError,
  activeResourceById,
  resourceByNumber,
  resourceTypeFromRequest,
  listableTypeFromRequest,
};
