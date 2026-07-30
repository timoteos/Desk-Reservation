const express = require('express');
const { pool, query } = require('../db');
const {
  rowToReservation,
  toTimestamps,
  generateConfirmationCode,
  toDateString,
  toMinutes,
} = require('../lib/reservationShape');
const { expirePending, expiryFor } = require('../lib/expirePending');
const { recordActivity } = require('../lib/activityLog');
const { tooSoonError, officeHoursError, workingDayError } = require('../lib/officeHours');
const { bookableDeskError } = require('../lib/deskGuard');
const { endSeries } = require('../lib/endSeries');

const router = express.Router();

// series_id identifies the whole arrangement, not one weekday of it. A Mon/Wed/Fri
// pattern is three recurring_schedules rows, and they are one schedule.
//
// This used to be derived here with a lateral join matching on user, desk and
// creation second. A stored column replaces it: the derivation could not survive
// a schedule being edited, and this reads as what it is.
const SELECT_RESERVATION = `
  SELECT r.reservation_id, r.user_id, r.desk_id, r.starts_at, r.ends_at,
         r.status, r.confirmation_code, r.booking_source, r.schedule_id,
         s.series_id,
         u.first_name, u.last_name,
         d.desk_number
    FROM reservations r
    JOIN users u ON u.user_id = r.user_id
    JOIN desks d ON d.desk_id = r.desk_id
    LEFT JOIN recurring_schedules s ON s.schedule_id = r.schedule_id
`;

// GET /api/reservations?date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    // Stale pending requests still hold their desk, so clear them before
    // reporting what's booked.
    await expirePending();

    const { date, scope } = req.query;

    // Availability for one day is public — the calendar needs it. Listing the
    // whole booking history is not: it is an administrative view, and no public
    // caller has ever used it.
    if (!date && req.user?.role !== 'admin') {
      return res.status(401).json({ message: 'Sign in to view all reservations.' });
    }

    let result;
    if (date) {
      result = await query(
        `${SELECT_RESERVATION}
           WHERE r.starts_at >= $1::date
             AND r.starts_at <  $1::date + interval '1 day'
             AND r.status IN ('pending', 'approved')
           ORDER BY r.starts_at`,
        [date]
      );
    } else if (scope === 'past') {
      // Most recent first: a past booking is usually looked up because someone
      // is asking about it now.
      result = await query(
        `${SELECT_RESERVATION}
           WHERE r.status = 'approved' AND r.ends_at < now()
           ORDER BY r.starts_at DESC`
      );
    } else if (scope === 'all') {
      result = await query(
        `${SELECT_RESERVATION} WHERE r.status = 'approved' ORDER BY r.starts_at DESC`
      );
    } else {
      result = await query(
        `${SELECT_RESERVATION}
           WHERE r.status = 'approved' AND r.ends_at >= now()
           ORDER BY r.starts_at`
      );
    }

    const reservations = result.rows.map(rowToReservation);

    // This endpoint is public because the calendar needs to know what's taken.
    // Availability only requires which desk and when — returning names and
    // confirmation codes would let anyone harvest codes and then look up other
    // people's bookings. Identifying details are for administrators.
    if (req.user?.role === 'admin') {
      return res.json(reservations);
    }

    res.json(
      reservations.map(({ id, date: d, startMin: s, endMin: e, deskNumber, deskId }) => ({
        id,
        date: d,
        startMin: s,
        endMin: e,
        deskNumber,
        deskId,
      }))
    );
  } catch (err) {
    next(err);
  }
});

const minutesFrom = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const DAY_LABELS = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday',
};

// A whole arrangement, found by the one code its holder was given.
//
// Returns null rather than throwing when the code is not a schedule code, so the
// caller can fall through to the booking lookup. The pattern is read from the
// live weekday rows, which is what the Schedules tab does — a weekday dropped by
// an edit is cancelled rather than deleted, and it should not show here.
async function scheduleByCode(code) {
  const { rows } = await query(
    `SELECT lead.schedule_id, lead.series_code,
            u.first_name, u.last_name,
            -- Status and desk come from the rows still standing, not from the row
            -- that happens to hold the code.
            --
            -- A weekday dropped by an edit is cancelled rather than deleted, and
            -- the code lives on the series' first row — so dropping that weekday
            -- made a running schedule report itself cancelled, and kept its old
            -- desk after a move. The admin list was fixed for exactly this and
            -- this query was written afterwards without the same filter.
            min(s.status) FILTER (WHERE s.status <> 'canceled')       AS status,
            coalesce(min(d.desk_number) FILTER (WHERE s.status <> 'canceled'),
                     min(d.desk_number))                              AS desk_number,
            min(s.active_from) FILTER (WHERE s.status <> 'canceled')  AS active_from,
            max(s.active_until) FILTER (WHERE s.status <> 'canceled') AS active_until,
            bool_or(s.active_until IS NULL) FILTER (WHERE s.status <> 'canceled') AS open_ended,
            array_agg(s.day_of_week ORDER BY s.day_of_week)
              FILTER (WHERE s.status <> 'canceled')  AS days,
            array_agg(s.start_time::text ORDER BY s.day_of_week)
              FILTER (WHERE s.status <> 'canceled')  AS start_times,
            array_agg(s.end_time::text ORDER BY s.day_of_week)
              FILTER (WHERE s.status <> 'canceled')  AS end_times
       FROM recurring_schedules lead
       JOIN recurring_schedules s ON s.series_id = lead.series_id
       JOIN users u ON u.user_id = lead.user_id
       LEFT JOIN desks d ON d.desk_id = s.desk_id
      WHERE lead.series_code = $1
      GROUP BY lead.schedule_id, lead.series_code, u.first_name, u.last_name`,
    [code]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  // The days still to come, and today's separately. Per-occurrence confirmation
  // codes are deliberately not selected: they exist because the column is NOT
  // NULL, not because anyone should be handed 39 of them.
  const { rows: occurrences } = await query(
    `SELECT r.reservation_id, r.starts_at, r.ends_at, r.status
       FROM reservations r
       JOIN recurring_schedules s ON s.schedule_id = r.schedule_id
      WHERE s.series_id = (SELECT series_id FROM recurring_schedules WHERE schedule_id = $1)
        AND r.status IN ('pending', 'approved')
        AND r.ends_at > now()
      ORDER BY r.starts_at`,
    [row.schedule_id]
  );

  const shape = (o) => ({
    id: o.reservation_id,
    date: toDateString(o.starts_at),
    startMin: toMinutes(o.starts_at),
    endMin: toMinutes(o.ends_at),
    status: o.status,
  });

  const today = toDateString(new Date());
  const upcoming = occurrences.map(shape);

  return {
    kind: 'schedule',
    scheduleId: row.schedule_id,
    confirmationCode: row.series_code,
    user: `${row.first_name} ${row.last_name}`,
    deskNumber: row.desk_number,
    // No live rows left means the whole arrangement is over, which is the one
    // case where the filtered aggregate is null.
    status: row.status ?? 'canceled',
    activeFrom: row.active_from ? toDateString(row.active_from) : null,
    activeUntil: row.open_ended || !row.active_until ? null : toDateString(row.active_until),
    openEnded: !!row.open_ended,
    pattern: (row.days ?? []).map((day, i) => ({
      day: DAY_LABELS[day],
      dayNumber: day,
      startMin: minutesFrom(row.start_times[i]),
      endMin: minutesFrom(row.end_times[i]),
    })),
    // What a check-in will need: this code, resolved to the day in progress.
    today: upcoming.find((o) => o.date === today) ?? null,
    upcoming,
    bookingsRemaining: upcoming.length,
  };
}

// GET /api/reservations/code/:code
//
// A code is either a single booking or a whole schedule, and the holder should
// not have to know which — they were given one code and they type it in. The
// response says which it turned out to be in `kind`.
//
// A schedule comes back as the arrangement plus the days it still has coming,
// never as a list of codes. `today` is called out separately because that is
// what a check-in needs: the same code, used at the door, has to resolve to the
// occurrence happening now rather than to the pattern in the abstract.
router.get('/code/:code', async (req, res, next) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    const result = await query(
      `${SELECT_RESERVATION} WHERE r.confirmation_code = $1`,
      [code]
    );
    if (result.rows.length > 0) {
      return res.json({ kind: 'booking', ...rowToReservation(result.rows[0]) });
    }

    const schedule = await scheduleByCode(code);
    if (schedule) return res.json(schedule);

    return res.status(404).json({ message: 'Reservation not found' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reservations/code/:code/cancel
//
// The confirmation code is the credential, as with an airline booking
// reference. Codes are random 8-character strings, so they aren't guessable.
router.patch('/code/:code/cancel', async (req, res, next) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    // A schedule code ends the arrangement, which is a bigger thing than
    // cancelling a booking — the caller is told exactly how many days that
    // released so the page can say so before and after.
    const schedule = await scheduleByCode(code);
    if (schedule) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await endSeries(client, {
          scheduleId: schedule.scheduleId,
          byCode: true,
        });
        if (!result) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: 'That schedule has already ended.',
          });
        }
        await client.query('COMMIT');
        return res.json({
          kind: 'schedule',
          status: 'canceled',
          bookingsCanceled: result.bookingsCanceled,
        });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    const { rows } = await query(
      `UPDATE reservations
          SET status = 'canceled', expires_at = NULL
        WHERE confirmation_code = $1
          AND status IN ('pending', 'approved')
          AND ends_at > now()
        RETURNING reservation_id`,
      [code]
    );

    if (rows.length === 0) {
      // Either no such code, already decided, or the booking has finished.
      // Reported together so the endpoint can't confirm a code exists.
      return res.status(409).json({
        message: 'That reservation can no longer be canceled. It may already be canceled, or it has ended.',
      });
    }

    await recordActivity({
      activityType: 'canceled',
      reservationId: rows[0].reservation_id,
      description: 'Cancelled using the confirmation code',
    });

    res.json({ kind: 'booking', status: 'canceled' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reservations/code/:code/occurrence/:id/cancel
//
// One day of a schedule, for the week the holder is on leave. The schedule code
// stays the credential and the occurrence is named by id, so cancelling a single
// Tuesday never requires handing out a code per day.
//
// The id is checked against the series the code opens, so a valid code cannot be
// pointed at somebody else's booking.
router.patch('/code/:code/occurrence/:id/cancel', async (req, res, next) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    const { rows } = await query(
      `UPDATE reservations r
          SET status = 'canceled', expires_at = NULL
        FROM recurring_schedules s, recurring_schedules lead
        WHERE r.reservation_id = $1
          AND s.schedule_id = r.schedule_id
          AND lead.series_code = $2
          AND s.series_id = lead.series_id
          AND r.status IN ('pending', 'approved')
          AND r.starts_at > now()
        RETURNING r.reservation_id, r.starts_at`,
      [req.params.id, code]
    );

    if (rows.length === 0) {
      // Wrong code, wrong series, already cancelled, or the day has started.
      // One message, so the endpoint cannot be used to probe which.
      return res.status(409).json({
        message: 'That day can no longer be canceled. It may already be canceled, or it has started.',
      });
    }

    await recordActivity({
      activityType: 'canceled',
      reservationId: rows[0].reservation_id,
      description: 'One day of a recurring schedule cancelled using the confirmation code',
    });

    res.json({ kind: 'occurrence', status: 'canceled', date: toDateString(rows[0].starts_at) });
  } catch (err) {
    next(err);
  }
});

// POST /api/reservations
router.post('/', async (req, res, next) => {
  try {
    const { userId, email, deskId, date, startMin, endMin } = req.body;

    // deskId is optional — omitting it asks the system to assign one.
    if ((!userId && !email) || !date || startMin == null || endMin == null) {
      return res.status(400).json({
        message: 'date, startMin, endMin and either userId or email are required',
      });
    }

    // Until DHS SSO is in place, the booker identifies themselves by email.
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { rows } = await query(
        'SELECT user_id FROM users WHERE lower(email) = lower($1) AND is_active',
        [email.trim()]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          message: `No account found for ${email.trim()}. Check the address or contact your administrator.`,
        });
      }
      resolvedUserId = rows[0].user_id;
    }

    // Office hours are enforced here, not only in the interface. A request that
    // never touched the calendar must not be able to book the office at 3am,
    // or on a Saturday.
    const dayProblem = workingDayError(date);
    if (dayProblem) return res.status(400).json({ message: dayProblem });

    const hoursProblem = officeHoursError(startMin, endMin);
    if (hoursProblem) return res.status(400).json({ message: hoursProblem });

    const { startsAt, endsAt } = toTimestamps(date, startMin, endMin);

    // A booking in the past would get an expires_at already behind us and be
    // swept the moment it's created, so refuse it here with a real reason
    // rather than letting it vanish silently.
    const timingProblem = tooSoonError(startsAt);
    if (timingProblem) return res.status(400).json({ message: timingProblem });

    if (deskId != null) {
      const deskProblem = await bookableDeskError(deskId);
      if (deskProblem) return res.status(400).json({ message: deskProblem });
    }

    // No desk chosen: pick one at random from those free for this window.
    // Random rather than lowest-numbered so bookings spread across the office
    // instead of piling onto Desk# 1.
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
          ORDER BY random()
          LIMIT 1`,
        [startsAt, endsAt]
      );
      if (rows.length === 0) {
        return res.status(409).json({
          message: 'Every desk is booked for that time. Try a different slot.',
        });
      }
      resolvedDeskId = rows[0].desk_id;
    }

    const inserted = await query(
      `INSERT INTO reservations
         (user_id, desk_id, starts_at, ends_at, confirmation_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING reservation_id`,
      [
        resolvedUserId,
        resolvedDeskId,
        startsAt,
        endsAt,
        generateConfirmationCode(),
        expiryFor(startsAt),
      ]
    );

    const result = await query(
      `${SELECT_RESERVATION} WHERE r.reservation_id = $1`,
      [inserted.rows[0].reservation_id]
    );

    const booking = rowToReservation(result.rows[0]);
    await recordActivity({
      activityType: 'created',
      reservationId: inserted.rows[0].reservation_id,
      actorUserId: resolvedUserId,
      description: `${booking.user} requested Desk# ${booking.deskNumber}`,
    });

    res.status(201).json(booking);
  } catch (err) {
    // The database rejects overlapping bookings outright — translate that into
    // something the UI can show rather than a 500.
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

module.exports = router;
