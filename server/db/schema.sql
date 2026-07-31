-- MQD Desk Reservation System — MVP schema
--
-- Scope: the four tables a working demo needs. Logs, activities, recurring
-- schedules, SSO columns, sponsorship, and desk positions are designed but
-- deliberately deferred — see the schema design record for the full target.
--
-- Apply with:  psql -d desk_reservation -f server/db/schema.sql

BEGIN;

-- Required for the exclusion constraint below: lets an equality check on an
-- integer column sit alongside a range overlap check in the same GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS recurring_schedules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS desks CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

CREATE TABLE roles (
  role_id    SERIAL PRIMARY KEY,
  role_type  TEXT NOT NULL UNIQUE
             CHECK (role_type IN ('member', 'admin', 'guest'))
);

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role_id       INTEGER NOT NULL REFERENCES roles(role_id),
  -- Null for anyone who cannot sign in. Once DHS SSO exists, staff will
  -- authenticate there and keep a null hash. Guests never get one at all:
  -- this is an internal application, so an external visitor has no way in and
  -- their confirmation code is permanently their only credential.
  password_hash TEXT,
  -- Which outside body a guest belongs to — the useful thing to know about a
  -- visitor that a name does not tell you. Null for staff.
  organization  TEXT,
  -- The admin who added this person. Kept for guests, where "who put this
  -- account here" is a question somebody will eventually ask; null for the
  -- seeded staff, who predate anyone being able to add a user.
  created_by_user_id INTEGER REFERENCES users(user_id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE desks (
  desk_id      SERIAL PRIMARY KEY,
  desk_number  INTEGER NOT NULL UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- A weekly booking pattern. One row per weekday, so a schedule that runs
-- Monday to Friday with a shorter Friday is five rows sharing a request.
--
-- Approval attaches here rather than to the reservations this generates —
-- otherwise a single weekly request would need ~60 individual approvals.
CREATE TABLE recurring_schedules (
  schedule_id   SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(user_id),
  desk_id       INTEGER REFERENCES desks(desk_id),
  -- A request covering several weekdays becomes one row per day, and they are
  -- one arrangement. Identity used to be derived from user + desk + creation
  -- second, which held only as long as nothing changed: adding a day later gives
  -- the new row a fresh created_at and drops it out of its own group. Editing a
  -- schedule needs a real identity, so this is it. Null until the first row of a
  -- series is inserted, then set to that row's id.
  series_id     INTEGER REFERENCES recurring_schedules(schedule_id),
  -- One code for the whole arrangement, held on its first row.
  --
  -- Every occurrence carries a confirmation code of its own, because each is a
  -- reservation row and the column is NOT NULL — but handing 39 of them to one
  -- intern was never a design, it was what fell out of generating 39 rows. A
  -- schedule is one thing to the person who holds it, so it gets one code: the
  -- code is what they check in with, and it stays the same when an admin moves
  -- the desk or the hours. Null on the other weekday rows of the same series,
  -- which is why UNIQUE rather than a partial index — Postgres allows repeated
  -- nulls in a unique constraint.
  series_code   TEXT UNIQUE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'canceled')),
  -- Set when the request is created. 'expired' is distinct from 'denied':
  -- one means nobody reviewed it in time, the other means someone said no.
  expires_at    TIMESTAMPTZ,
  decided_by_user_id INTEGER REFERENCES users(user_id),
  decided_at    TIMESTAMPTZ,
  active_from   DATE NOT NULL DEFAULT current_date,
  active_until  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT schedule_ends_after_start CHECK (end_time > start_time)
);

CREATE TABLE reservations (
  reservation_id     SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(user_id),
  desk_id            INTEGER NOT NULL REFERENCES desks(desk_id),
  schedule_id        INTEGER REFERENCES recurring_schedules(schedule_id) ON DELETE SET NULL,
  starts_at          TIMESTAMP NOT NULL,
  ends_at            TIMESTAMP NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'canceled')),
  -- LEAST(created_at + 24h, starts_at - 2h). The second bound matters more:
  -- a request for tomorrow morning must not sit pending past the reservation.
  expires_at         TIMESTAMPTZ,
  -- Who approved or denied, and when. Null means no one decided it: seeded
  -- fixtures, or a request that lapsed. The logs table will eventually carry
  -- the full audit trail; this covers "who approved my desk?" directly.
  decided_by_user_id INTEGER REFERENCES users(user_id),
  decided_at         TIMESTAMPTZ,
  confirmation_code  TEXT NOT NULL UNIQUE,
  -- How the booking came about. decided_by_user_id cannot answer this: an
  -- admin approving someone's request and an admin booking on their behalf
  -- both record the admin, so the two are indistinguishable without it.
  booking_source     TEXT NOT NULL DEFAULT 'user'
                     CHECK (booking_source IN ('user', 'admin', 'recurring')),
  -- The admin who vouched for an external visitor occupying this desk. Held on
  -- the booking rather than on the guest because the responsibility is for a
  -- visit, not for a person: the same contractor may come in for one admin in
  -- March and another in June, and each of them answers for their own day.
  -- Null for staff bookings, which need no sponsor.
  sponsored_by_user_id INTEGER REFERENCES users(user_id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ends_after_start CHECK (ends_at > starts_at),

  -- The reason this project uses PostgreSQL: two live reservations can never
  -- overlap on the same desk. Enforced by the database, so no combination of
  -- concurrent requests can produce a double booking.
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    desk_id WITH =,
    tsrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('pending', 'approved'))
);

-- What kinds of thing can happen. A lookup table rather than free text so
-- "show me every denial this month" is a join, not a string match.
CREATE TABLE activities (
  activity_id    SERIAL PRIMARY KEY,
  activity_type  TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL
);

-- The audit trail: who did what, to which booking, and when.
CREATE TABLE logs (
  log_id          SERIAL PRIMARY KEY,
  activity_id     INTEGER NOT NULL REFERENCES activities(activity_id),
  -- ON DELETE SET NULL rather than CASCADE: losing history when a booking is
  -- removed would defeat the point of keeping a trail.
  reservation_id  INTEGER REFERENCES reservations(reservation_id) ON DELETE SET NULL,
  schedule_id     INTEGER REFERENCES recurring_schedules(schedule_id) ON DELETE SET NULL,
  -- Null means the system acted, not that the actor is unknown — the expiry
  -- sweep has no person behind it.
  actor_user_id   INTEGER REFERENCES users(user_id),
  -- Structured before/after for changes, so an extension records what moved
  -- rather than only that something did.
  metadata        JSONB,
  description     TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The log is read newest-first and occasionally filtered by kind.
CREATE INDEX logs_occurred_idx ON logs (occurred_at DESC);
CREATE INDEX logs_activity_idx ON logs (activity_id);

-- Availability lookups filter by day and desk; this covers the common path.
CREATE INDEX reservations_desk_time_idx
  ON reservations (desk_id, starts_at);

-- The expiry sweep runs often, so keep its lookup cheap.
CREATE INDEX reservations_pending_expiry_idx
  ON reservations (expires_at) WHERE status = 'pending';

CREATE INDEX schedules_pending_expiry_idx
  ON recurring_schedules (expires_at) WHERE status = 'pending';

COMMIT;
