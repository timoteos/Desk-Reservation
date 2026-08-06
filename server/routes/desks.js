const express = require('express');
const { pool, query } = require('../db');
const { toMinutes, generateConfirmationCode } = require('../lib/reservationShape');
const {
  officeHoursError, workingDayError, OFFICE_START, OFFICE_END,
  OFFICE_HOURS_LABEL, minutesOf,
} = require('../lib/officeHours');
const { releaseNoShows } = require('../lib/checkIn');
const { recordActivity } = require('../lib/activityLog');
const { guestDetailsError, resolveGuest } = require('../lib/guests');
const {
  LISTABLE_TYPES, listableTypeFromRequest,
  listResources, labelFor, shortLabelFor, resourceByNumber,
} = require('../lib/resources');

const router = express.Router();

// The one place a default for the resource type belongs: at the HTTP boundary,
// stated once where it is visible, so callers written before rooms existed and
// any bookmarked URL keep working unchanged. Everything inside the query layer
// stays strict — see server/lib/resources.js.
// These two endpoints are read-only, so 'all' is a legitimate answer here and
// nowhere near a booking path.
const typeFromQuery = (req) => listableTypeFromRequest(req.query.resource_type);

const BAD_TYPE = `resource_type must be one of ${LISTABLE_TYPES.join(', ')}.`;

// GET /api/desks?resource_type=desk|room
router.get('/', async (req, res, next) => {
  try {
    const resourceType = typeFromQuery(req);
    if (!resourceType) return res.status(400).json({ message: BAD_TYPE });

    const rows = await listResources(resourceType);

    res.json(
      rows.map((row) => ({
        id: String(row.desk_id),
        number: row.desk_number,
        // Full name for anywhere a sentence names it; short for the floor plan.
        label: labelFor(row),
        shortLabel: shortLabelFor(row),
        resourceType: row.resource_type,
        // Null for a desk, which seats one by construction.
        capacity: row.capacity,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/desks/status — the floor, right now.
//
// Deliberately carries no names. It feeds a screen in a lobby that anybody can
// stand in front of, and a map showing who sits where would publish staff
// whereabouts to every visitor and contractor walking past. Free, reserved or
// in use is all a person choosing a desk needs, and all a passer-by should get.
//
// `freeUntilMin` is what makes the map actionable rather than decorative: a
// desk free until 14:00 is a different offer from one free all afternoon, and
// it is the ceiling a walk-up claim gets capped to.
router.get('/status', async (req, res, next) => {
  try {
    const resourceType = typeFromQuery(req);
    if (!resourceType) return res.status(400).json({ message: BAD_TYPE });

    await releaseNoShows();

    const { rows } = await query(
      `SELECT d.desk_id, d.desk_number, d.display_name, d.short_name,
              d.resource_type, d.capacity,
              r.starts_at, r.ends_at, r.checked_in_at
         FROM desks d
    LEFT JOIN reservations r
           ON r.desk_id = d.desk_id
          -- pending as well as approved, because the exclusion constraint
          -- covers both. A booking awaiting approval still holds the desk, so
          -- showing it free meant offering something the database would refuse
          -- — a green desk that answers "somebody just took that" when nobody
          -- had. The ceiling query below already counted both; these two
          -- disagreed.
          AND r.status IN ('pending', 'approved')
          AND r.starts_at::date = current_date
        WHERE d.is_active AND ($1 = 'all' OR d.resource_type = $1)
        ORDER BY d.resource_type = 'room', d.desk_number, r.starts_at`,
      [resourceType]
    );

    const nowMin = minutesOf(new Date());
    const byDesk = new Map();

    for (const row of rows) {
      if (!byDesk.has(row.desk_id)) {
        byDesk.set(row.desk_id, {
          id: String(row.desk_id),
          number: row.desk_number,
          label: labelFor(row),
          shortLabel: shortLabelFor(row),
          resourceType: row.resource_type,
          capacity: row.capacity,
          bookings: [],
        });
      }
      if (row.starts_at) {
        byDesk.get(row.desk_id).bookings.push({
          startMin: toMinutes(row.starts_at),
          endMin: toMinutes(row.ends_at),
          checkedIn: row.checked_in_at != null,
        });
      }
    }

    const desks = [...byDesk.values()].map(({ bookings, ...desk }) => {
      const current = bookings.find((b) => b.startMin <= nowMin && b.endMin > nowMin);

      if (current) {
        return {
          ...desk,
          // Booked with somebody in the seat, against booked with nobody there
          // yet. Collapsing the two either wastes a desk or sends somebody into
          // a chair that is about to be claimed.
          status: current.checkedIn ? 'in_use' : 'reserved',
          untilMin: current.endMin,
        };
      }

      const next = bookings.find((b) => b.startMin > nowMin);
      return { ...desk, status: 'free', freeUntilMin: next ? next.startMin : OFFICE_END };
    });

    res.json({ nowMin, desks });
  } catch (err) {
    next(err);
  }
});

// POST /api/desks/:number/claim
//   staff:   { email, endMin? }
//   visitor: { guest: { firstName, lastName, email, organization? }, hostEmail, endMin? }
//
// Somebody standing at a free desk, taking it. Separate from the ordinary
// booking route so it can force **today, starting now** — a walk-up must not be
// able to reserve next Tuesday, which is precisely why it needs no approval and
// no sign-in. Being physically present is the authorisation.
//
// Approved and checked in on creation. Making somebody wait for an
// administrator to click while they stand at an empty desk would be theatre,
// and asking them to check in to a desk they are already sitting at would be
// worse.
//
// A visitor may sign themselves in here, which the admin path does not allow —
// but only because this screen is staffed, and only against a host. Sponsorship
// is not waived, it is asked for: `hostEmail` is the member of staff the
// visitor has come to see, and they are recorded as answering for the visit.
// That is the question a front desk asks anyway, and it puts the record on
// somebody who actually knows who this person is.
router.post('/:number/claim', async (req, res, next) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { email, guest, hostEmail, endMin } = req.body;

    if (!guest && (!email || typeof email !== 'string' || !email.trim())) {
      return res.status(400).json({ message: 'An email address is required.' });
    }
    if (guest) {
      const problem = guestDetailsError(guest);
      if (problem) return res.status(400).json({ message: problem });
      if (!hostEmail || typeof hostEmail !== 'string' || !hostEmail.trim()) {
        return res.status(400).json({
          message: 'A visitor needs the address of the person they are here to see.',
        });
      }
    }

    await releaseNoShows();

    const now = new Date();
    const startMin = minutesOf(now);

    const dayProblem = workingDayError(now);
    if (dayProblem) return res.status(400).json({ message: dayProblem });

    // Checked on the start alone, before the end is worked out. A claim starts
    // now and its end is derived, so outside office hours the derived end lands
    // before the start and the generic check blamed the person for a time they
    // never chose: "End time must be after start time" at half past eleven at
    // night, when the true answer is that the office is shut.
    if (startMin < OFFICE_START || startMin >= OFFICE_END) {
      return res.status(400).json({
        message: `The office is closed. Desks can be taken during office hours, ${OFFICE_HOURS_LABEL}.`,
      });
    }

    // Desks only, by name rather than by silence.
    //
    // A room is refused here deliberately, not incidentally: whether a
    // conference room can be taken with no approval, and who checks one in, are
    // open questions with the PM. Until they are answered the safe default is
    // to refuse — an allow-list, the same shape the check-in fix took after a
    // deny-list let an unapproved request through.
    const desk = await resourceByNumber('desk', req.params.number, client);
    if (!desk) {
      const room = await resourceByNumber('room', req.params.number, client);
      return res.status(400).json({
        message: room
          ? `${labelFor(room)} cannot be taken at the front desk. Book a conference room from the Reservations page.`
          : 'That desk is not available — it may have been taken out of service.',
      });
    }
    const deskId = desk.desk_id;

    // Capped by whatever is booked next on this desk, so a claim is never
    // offered a window it would be thrown out of half way through.
    const { rows: nextRows } = await client.query(
      `SELECT min(starts_at) AS next_start
         FROM reservations
        WHERE desk_id = $1 AND status IN ('pending','approved')
          AND starts_at::date = current_date
          AND starts_at > now()::timestamp`,
      [deskId]
    );
    const ceiling = nextRows[0].next_start ? toMinutes(nextRows[0].next_start) : OFFICE_END;
    const finalEnd = Math.min(Number.isInteger(endMin) ? endMin : ceiling, ceiling);

    const hoursProblem = officeHoursError(startMin, finalEnd, { alignStart: false });
    if (hoursProblem) return res.status(400).json({ message: hoursProblem });

    const staffByEmail = async (address) => {
      const { rows } = await client.query(
        `SELECT u.user_id, u.first_name, u.last_name, r.role_type
           FROM users u JOIN roles r ON r.role_id = u.role_id
          WHERE lower(u.email) = lower($1) AND u.is_active`,
        [address.trim()]
      );
      return rows[0] ?? null;
    };

    await client.query('BEGIN');
    inTransaction = true;

    let user;
    let sponsorId = null;

    if (guest) {
      const host = await staffByEmail(hostEmail);
      if (!host || host.role_type === 'guest') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          message: `No MQD account for ${hostEmail.trim()}. A visitor has to name the person they are here to see.`,
        });
      }

      const resolved = await resolveGuest(client, guest, host.user_id);
      if (!resolved.ok) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(resolved.status).json({ message: resolved.message });
      }
      user = resolved.user;
      sponsorId = host.user_id;
    } else {
      user = await staffByEmail(email);
      if (!user) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          message: `No account for ${email.trim()}. If you are visiting, sign in as a visitor instead.`,
        });
      }
    }

    const at = (mins) => new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      Math.floor(mins / 60), mins % 60
    );

    const { rows } = await client.query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code,
          status, booking_source, checked_in_at, sponsored_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'approved', 'walk_up', now(), $6)
       RETURNING reservation_id, confirmation_code`,
      [user.user_id, deskId, at(startMin), at(finalEnd), generateConfirmationCode(), sponsorId]
    );

    await recordActivity({
      activityType: 'booked_by_admin',
      reservationId: rows[0].reservation_id,
      actorUserId: sponsorId,
      description: guest
        ? `${labelFor(desk)} taken by an external visitor at the front desk`
        : `${labelFor(desk)} claimed in person and checked in`,
      metadata: guest
        ? { walkUp: true, external: true, guestUserId: user.user_id,
            sponsoredByUserId: sponsorId, organization: user.organization ?? null }
        : { walkUp: true },
    }, client);

    await client.query('COMMIT');
    inTransaction = false;

    res.status(201).json({
      external: Boolean(guest),
      confirmationCode: rows[0].confirmation_code,
      name: `${user.first_name} ${user.last_name}`,
      deskNumber: Number(req.params.number),
      deskLabel: labelFor(desk),
      startMin,
      endMin: finalEnd,
    });
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({ message: 'Somebody just took that desk. Pick another.' });
    }
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
