const express = require('express');
const { pool, query } = require('../db');
const { expirePending } = require('../lib/expirePending');
const { toTimestamps, generateConfirmationCode, toDateString } = require('../lib/reservationShape');
const { requireAdmin } = require('../lib/auth');
const { recordActivity } = require('../lib/activityLog');
const { endSeries } = require('../lib/endSeries');
const { tooSoonError, officeHoursError, workingDayError } = require('../lib/officeHours');
const { bookableDeskError } = require('../lib/deskGuard');

const router = express.Router();

// The whole approval queue is administrative — nothing here is public.
router.use(requireAdmin);

// What has to be true of an external visitor before an admin can vouch for one.
// An address is required because the confirmation code is the only way a guest
// can ever reach their booking — this is an internal application and they have
// no other way in — so a visitor with no address has no route to their own desk.
function guestDetailsError(guest) {
  const has = (v) => typeof v === 'string' && v.trim().length > 0;

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

const DAY_LABELS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

const minutesFrom = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Renders a booking window the way the log reads it back — "Jul 29, 8:00 AM –
// 4:30 PM". Built here rather than in the client because the description is
// stored, and a stored sentence should not depend on who later reads it.
const fmtTime = (d) => {
  const h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

const fmtWindow = (start, end) => {
  const day = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${fmtTime(start)} – ${fmtTime(end)}`;
};

// GET /api/requests — everything awaiting a decision, both kinds in one queue.
//
// A recurring request is one item covering many bookings, not many items: a
// weekly pattern would otherwise need ~39 separate approvals.
router.get('/', async (req, res, next) => {
  try {
    await expirePending();

    const oneOff = await query(
      `SELECT r.reservation_id, r.starts_at, r.ends_at, r.expires_at,
              r.confirmation_code, d.desk_number,
              u.first_name, u.last_name, u.email, ro.role_type
         FROM reservations r
         JOIN users u  ON u.user_id = r.user_id
         JOIN roles ro ON ro.role_id = u.role_id
         JOIN desks d  ON d.desk_id = r.desk_id
        WHERE r.status = 'pending' AND r.schedule_id IS NULL
        ORDER BY r.starts_at`
    );

    // Grouped by series: the rows one request created share a series_id, so they
    // collapse into a single queue entry rather than one per weekday.
    const recurring = await query(
      `SELECT s.series_id AS group_id,
              u.first_name, u.last_name, u.email, ro.role_type,
              d.desk_number,
              min(s.expires_at) AS expires_at,
              min(s.active_from) AS active_from,
              -- max() ignores nulls, so an open-ended schedule needs asking about
              -- separately rather than reading as bounded by its longest sibling.
              max(s.active_until) AS active_until,
              bool_or(s.active_until IS NULL) AS open_ended,
              array_agg(s.schedule_id ORDER BY s.day_of_week) AS schedule_ids,
              array_agg(s.day_of_week ORDER BY s.day_of_week) AS days,
              array_agg(s.start_time::text ORDER BY s.day_of_week) AS start_times,
              array_agg(s.end_time::text ORDER BY s.day_of_week) AS end_times,
              (SELECT count(*)::int FROM reservations r
                WHERE r.schedule_id = ANY(array_agg(s.schedule_id))
                  AND r.status = 'pending') AS booking_count
         FROM recurring_schedules s
         JOIN users u  ON u.user_id = s.user_id
         JOIN roles ro ON ro.role_id = u.role_id
         LEFT JOIN desks d ON d.desk_id = s.desk_id
        WHERE s.status = 'pending'
        GROUP BY s.series_id, u.user_id, u.first_name, u.last_name, u.email,
                 ro.role_type, d.desk_number
        ORDER BY min(s.created_at)`
    );

    res.json([
      ...oneOff.rows.map((row) => ({
        kind: 'one-off',
        id: String(row.reservation_id),
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role_type,
        deskNumber: row.desk_number,
        date: row.starts_at.toISOString().split('T')[0],
        startMin: row.starts_at.getHours() * 60 + row.starts_at.getMinutes(),
        endMin: row.ends_at.getHours() * 60 + row.ends_at.getMinutes(),
        confirmationCode: row.confirmation_code,
        expiresAt: row.expires_at,
      })),
      ...recurring.rows.map((row) => ({
        kind: 'recurring',
        id: String(row.group_id),
        scheduleIds: row.schedule_ids,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role_type,
        deskNumber: row.desk_number,
        bookingCount: row.booking_count,
        activeFrom: row.active_from ? toDateString(row.active_from) : null,
        activeUntil: row.open_ended || !row.active_until ? null : toDateString(row.active_until),
        openEnded: row.open_ended,
        pattern: row.days.map((day, i) => ({
          day: DAY_LABELS[day],
          startMin: minutesFrom(row.start_times[i]),
          endMin: minutesFrom(row.end_times[i]),
        })),
        expiresAt: row.expires_at,
      })),
    ]);
  } catch (err) {
    next(err);
  }
});

// The acting admin comes from the verified token. A client-supplied email is
// not trusted for attribution — anyone could claim to be anyone.
const resolveDecider = (req) => req.user?.sub ?? null;

// POST /api/requests/book   { userId, deskId?, date, startMin, endMin }
//
// An admin booking, for themselves or on someone's behalf. Created approved
// rather than pending: the admin is the approver, so routing it through their
// own queue would be theatre. Recorded as decided by them for the audit trail.
// `guest` books somebody who is not in the system: an external visitor an admin
// is vouching for. The sponsor is always the admin holding the token and is
// never read from the body — letting a caller name who is responsible would
// make the field worthless as a record.
router.post('/book', async (req, res, next) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { userId, guest, deskId, date, startMin, endMin } = req.body;

    if ((!userId && !guest) || !date || startMin == null || endMin == null) {
      return res.status(400).json({
        message: 'date, startMin, endMin and either userId or guest are required',
      });
    }

    if (userId && guest) {
      return res.status(400).json({
        message: 'Book a staff member or an external visitor, not both.',
      });
    }

    const guestProblem = guest ? guestDetailsError(guest) : null;
    if (guestProblem) return res.status(400).json({ message: guestProblem });

    const dayProblem = workingDayError(date);
    if (dayProblem) return res.status(400).json({ message: dayProblem });

    const hoursProblem = officeHoursError(startMin, endMin);
    if (hoursProblem) return res.status(400).json({ message: hoursProblem });

    if (deskId != null) {
      const deskProblem = await bookableDeskError(deskId);
      if (deskProblem) return res.status(400).json({ message: deskProblem });
    }

    const { startsAt, endsAt } = toTimestamps(date, startMin, endMin);

    const timingProblem = tooSoonError(startsAt);
    if (timingProblem) return res.status(400).json({ message: timingProblem });

    let resolvedDeskId = deskId;
    if (!resolvedDeskId) {
      const { rows } = await query(
        `SELECT desk_id FROM desks d
          WHERE d.is_active
            AND NOT EXISTS (
              SELECT 1 FROM reservations r
               WHERE r.desk_id = d.desk_id
                 AND r.status IN ('pending', 'approved')
                 AND tsrange(r.starts_at, r.ends_at) && tsrange($1, $2)
            )
          ORDER BY random() LIMIT 1`,
        [startsAt, endsAt]
      );
      if (rows.length === 0) {
        return res.status(409).json({
          message: 'Every desk is booked for that time. Try a different slot.',
        });
      }
      resolvedDeskId = rows[0].desk_id;
    }

    const sponsorId = resolveDecider(req);

    // One transaction, because creating a visitor and booking their desk is one
    // intention. If the desk turns out to be taken, an account left behind would
    // not only be litter — the email is unique, so the retry would fail on a row
    // the first attempt created.
    await client.query('BEGIN');
    inTransaction = true;

    let bookedForId = userId;
    let guestRow = null;

    if (guest) {
      const email = guest.email.trim();

      // Case-insensitively, because the unique index is on the literal string
      // and "Ana@acme.test" would otherwise become a second account for the
      // same person.
      const findExisting = () => client.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.organization, r.role_type
           FROM users u JOIN roles r ON r.role_id = u.role_id
          WHERE lower(u.email) = lower($1)`,
        [email]
      );

      // An address already on file. Reuse a returning visitor; refuse a
      // colleague, because booking a member of staff through the visitor path
      // would record a sponsor for somebody who does not need one and file
      // them under external in the log.
      const useExisting = async (row) => {
        if (row.role_type !== 'guest') {
          await client.query('ROLLBACK');
          inTransaction = false;
          res.status(409).json({
            message: `${email} belongs to ${row.first_name} ${row.last_name}, who is staff. Book them from the staff list instead.`,
          });
          return false;
        }
        bookedForId = row.user_id;
        guestRow = row;
        return true;
      };

      const existing = await findExisting();

      if (existing.rows.length > 0) {
        if (!(await useExisting(existing.rows[0]))) return;
      } else {
        // ON CONFLICT rather than a bare INSERT, because the check above and
        // this write are not one atomic step: two admins booking the same new
        // visitor at the same moment both found nothing, both inserted, and the
        // loser hit the unique index and fell through to a 500. It now waits
        // for the other transaction, does nothing, and reads the row that
        // transaction committed.
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
            sponsorId,
          ]
        );

        if (created.rows.length > 0) {
          bookedForId = created.rows[0].user_id;
          guestRow = created.rows[0];
        } else {
          const raced = await findExisting();
          if (raced.rows.length === 0) {
            await client.query('ROLLBACK');
            inTransaction = false;
            return res.status(409).json({
              message: 'That visitor could not be created. Try again.',
            });
          }
          if (!(await useExisting(raced.rows[0]))) return;
        }
      }
    }

    const { rows } = await client.query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code,
          status, decided_by_user_id, decided_at, booking_source,
          sponsored_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, now(), 'admin', $7)
       RETURNING reservation_id, confirmation_code`,
      [
        bookedForId, resolvedDeskId, startsAt, endsAt,
        generateConfirmationCode(), sponsorId,
        guest ? sponsorId : null,
      ]
    );

    const deskRow = await client.query(
      'SELECT desk_number FROM desks WHERE desk_id = $1',
      [resolvedDeskId]
    );
    const deskNumber = deskRow.rows[0].desk_number;

    // The sponsor goes into the entry itself, not left to be recovered by
    // joining to a row somebody may later edit. An audit line should still mean
    // what it meant on the day it was written.
    await recordActivity({
      activityType: 'booked_by_admin',
      reservationId: rows[0].reservation_id,
      actorUserId: sponsorId,
      description: guest
        ? `Booked Desk# ${deskNumber} for an external visitor and sponsored their access`
        : `Booked Desk# ${deskNumber} on behalf of a user`,
      // The organisation comes from the visitor's record, not from what was
      // typed on this booking. A returning visitor's second booking need not
      // repeat it, and a log line saying they belong to nowhere would be a
      // false statement in the one place that is supposed to be reliable.
      metadata: guest
        ? { external: true, guestUserId: bookedForId, sponsoredByUserId: sponsorId,
            organization: guestRow?.organization ?? null }
        : null,
    }, client);

    await client.query('COMMIT');
    inTransaction = false;

    res.status(201).json({
      id: String(rows[0].reservation_id),
      confirmationCode: rows[0].confirmation_code,
      deskNumber,
      status: 'approved',
      external: Boolean(guest),
      bookedFor: guestRow ? `${guestRow.first_name} ${guestRow.last_name}` : undefined,
    });
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'That desk is already reserved for part of this time range.',
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/requests/reservations/:id   { deskId?, date?, startMin?, endMin? }
//
// Moves a live booking to a different desk, a different time, or both. One
// endpoint rather than two because the fields are not independent: freeing up
// an afternoon may change which desks are available, so a caller that changed
// the time alone could leave the booking on a desk that is now taken.
//
// The holder keeps their booking and their confirmation code — the code
// identifies the reservation, not the desk, so a code already handed out stays
// valid and will report the new details.
router.patch('/reservations/:id', async (req, res, next) => {
  try {
    const { deskId, date, startMin, endMin } = req.body;

    const wantsTimeChange = date != null || startMin != null || endMin != null;
    if (deskId == null && !wantsTimeChange) {
      return res.status(400).json({ message: 'Nothing to change.' });
    }
    // A partial time is ambiguous — half a window cannot be validated against
    // the other half, so require the whole thing or none of it.
    if (wantsTimeChange && (date == null || startMin == null || endMin == null)) {
      return res.status(400).json({
        message: 'Changing the time needs date, startMin and endMin together.',
      });
    }

    const existing = await query(
      `SELECT r.reservation_id, r.desk_id, r.starts_at, r.ends_at, r.schedule_id,
              d.desk_number
         FROM reservations r
         JOIN desks d ON d.desk_id = r.desk_id
        WHERE r.reservation_id = $1 AND r.status = 'approved' AND r.ends_at > now()`,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(409).json({
        message: 'That reservation can no longer be edited — it may be cancelled, or it has ended.',
      });
    }
    const before = existing.rows[0];

    let startsAt = before.starts_at;
    let endsAt = before.ends_at;
    if (deskId != null) {
      const deskProblem = await bookableDeskError(deskId);
      if (deskProblem) return res.status(400).json({ message: deskProblem });
    }

    if (wantsTimeChange) {
      const dayProblem = workingDayError(date);
      if (dayProblem) return res.status(400).json({ message: dayProblem });

      const hoursProblem = officeHoursError(startMin, endMin);
      if (hoursProblem) return res.status(400).json({ message: hoursProblem });

      ({ startsAt, endsAt } = toTimestamps(date, startMin, endMin));
      const timingProblem = tooSoonError(startsAt);
      if (timingProblem) return res.status(400).json({ message: timingProblem });
    }

    const nextDeskId = deskId ?? before.desk_id;

    const { rows } = await query(
      `UPDATE reservations
          SET desk_id = $2, starts_at = $3, ends_at = $4,
              decided_by_user_id = $5, decided_at = now()
        WHERE reservation_id = $1
        RETURNING reservation_id`,
      [req.params.id, nextDeskId, startsAt, endsAt, resolveDecider(req)]
    );

    const deskRow = await query('SELECT desk_number FROM desks WHERE desk_id = $1', [nextDeskId]);
    const toDeskNumber = deskRow.rows[0]?.desk_number;

    // Record only what actually moved, so the trail doesn't claim a desk
    // changed when the admin edited the time and left it alone.
    const changes = {};
    if (toDeskNumber !== before.desk_number) {
      changes.desk = { from: before.desk_number, to: toDeskNumber };
    }
    if (startsAt.getTime() !== before.starts_at.getTime() || endsAt.getTime() !== before.ends_at.getTime()) {
      changes.time = {
        from: { startsAt: before.starts_at, endsAt: before.ends_at },
        to: { startsAt, endsAt },
      };
    }

    const parts = [];
    if (changes.desk) parts.push(`Desk# ${changes.desk.from} → Desk# ${changes.desk.to}`);
    if (changes.time) parts.push(`${fmtWindow(before.starts_at, before.ends_at)} → ${fmtWindow(startsAt, endsAt)}`);

    await recordActivity({
      activityType: 'modified',
      reservationId: rows[0].reservation_id,
      actorUserId: resolveDecider(req),
      metadata: changes,
      description: parts.join(', ') || 'No change',
    });

    res.json({
      id: String(rows[0].reservation_id),
      deskId: nextDeskId,
      deskNumber: toDeskNumber,
      changed: Object.keys(changes),
    });
  } catch (err) {
    if (err.constraint === 'no_double_booking') {
      return res.status(409).json({
        message: 'That desk is already reserved for part of this time range.',
      });
    }
    if (err.constraint === 'ends_after_start') {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }
    next(err);
  }
});

// PATCH /api/requests/schedules/:id/cancel
//
// Ends a recurring schedule and releases the bookings it still holds. The work
// is in lib/endSeries, shared with the holder ending their own from the
// confirmation code page — one operation, not two that drift.
router.patch('/schedules/:id/cancel', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await endSeries(client, {
      scheduleId: req.params.id,
      actorUserId: resolveDecider(req),
    });

    if (!result) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'That schedule is no longer active — it may already have been ended.',
      });
    }

    await client.query('COMMIT');
    res.json({
      scheduleId: String(req.params.id),
      schedulesEnded: result.scheduleIds.length,
      bookingsCanceled: result.bookingsCanceled,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/requests/reservations/:id/cancel
//
// The administrative override: cancel any live booking without needing the
// holder's confirmation code. Recorded against the admin who did it.
router.patch('/reservations/:id/cancel', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE reservations
          SET status = 'canceled', expires_at = NULL,
              decided_by_user_id = $2, decided_at = now()
        WHERE reservation_id = $1
          AND status IN ('pending', 'approved')
          AND ends_at > now()
        RETURNING reservation_id`,
      [req.params.id, resolveDecider(req)]
    );

    if (rows.length === 0) {
      return res.status(409).json({
        message: 'That reservation can no longer be canceled — it may already be canceled, or it has ended.',
      });
    }
    await recordActivity({
      activityType: 'overridden',
      reservationId: rows[0].reservation_id,
      actorUserId: resolveDecider(req),
      description: 'Cancelled by an administrator without the holder\'s code',
    });

    res.json({ id: String(rows[0].reservation_id), status: 'canceled' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/one-off/:id   { decision }
router.patch('/one-off/:id', async (req, res, next) => {
  try {
    const { decision } = req.body;
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'denied'" });
    }

    const deciderId = resolveDecider(req);

    const { rows } = await query(
      `UPDATE reservations
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE reservation_id = $2 AND status = 'pending'
        RETURNING reservation_id`,
      [decision, req.params.id, deciderId]
    );

    if (rows.length === 0) {
      return res.status(409).json({
        message: 'That request is no longer pending — it may have expired or been decided already.',
      });
    }
    await recordActivity({
      activityType: decision,
      reservationId: rows[0].reservation_id,
      actorUserId: deciderId,
    });

    res.json({ id: String(rows[0].reservation_id), status: decision });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/recurring/:id  { decision: 'approved' | 'denied' }
// One decision covers the whole pattern and every booking it generated.
router.patch('/recurring/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { decision } = req.body;
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'denied'" });
    }

    const deciderId = resolveDecider(req);

    await client.query('BEGIN');

    // Approving one weekday of a pattern has to carry the rest of it, which is
    // what series_id is for.
    const { rows: group } = await client.query(
      `SELECT s2.schedule_id
         FROM recurring_schedules s1
         JOIN recurring_schedules s2 ON s2.series_id = s1.series_id
        WHERE s1.schedule_id = $1 AND s2.status = 'pending'`,
      [req.params.id]
    );

    if (group.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'That request is no longer pending — it may have expired or been decided already.',
      });
    }

    const ids = group.map((r) => r.schedule_id);

    await client.query(
      `UPDATE recurring_schedules
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE schedule_id = ANY($2::int[])`,
      [decision, ids, deciderId]
    );

    const { rowCount } = await client.query(
      `UPDATE reservations
          SET status = $1, expires_at = NULL,
              decided_by_user_id = $3, decided_at = now()
        WHERE schedule_id = ANY($2::int[]) AND status = 'pending'`,
      [decision, ids, deciderId]
    );

    await recordActivity({
      activityType: decision,
      scheduleId: Number(req.params.id),
      actorUserId: deciderId,
      metadata: { bookingsAffected: rowCount },
      description: `Recurring schedule ${decision} — ${rowCount} booking(s) updated`,
    }, client);

    await client.query('COMMIT');
    res.json({ id: req.params.id, status: decision, bookingsUpdated: rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
