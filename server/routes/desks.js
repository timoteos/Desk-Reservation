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

const router = express.Router();

// GET /api/desks
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT desk_id, desk_number, is_active
         FROM desks
        WHERE is_active
        ORDER BY desk_number`
    );

    res.json(
      result.rows.map((row) => ({
        id: String(row.desk_id),
        number: row.desk_number,
        label: `Desk# ${row.desk_number}`,
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
    await releaseNoShows();

    const { rows } = await query(
      `SELECT d.desk_id, d.desk_number,
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
        WHERE d.is_active
        ORDER BY d.desk_number, r.starts_at`
    );

    const nowMin = minutesOf(new Date());
    const byDesk = new Map();

    for (const row of rows) {
      if (!byDesk.has(row.desk_id)) {
        byDesk.set(row.desk_id, {
          id: String(row.desk_id),
          number: row.desk_number,
          label: `Desk# ${row.desk_number}`,
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

    const { rows: deskRows } = await client.query(
      'SELECT desk_id FROM desks WHERE desk_number = $1 AND is_active',
      [req.params.number]
    );
    if (deskRows.length === 0) {
      return res.status(400).json({
        message: 'That desk is not available — it may have been taken out of service.',
      });
    }
    const deskId = deskRows[0].desk_id;

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
        ? `Desk# ${req.params.number} taken by an external visitor at the front desk`
        : `Desk# ${req.params.number} claimed in person and checked in`,
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
