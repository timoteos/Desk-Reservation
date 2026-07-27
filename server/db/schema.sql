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

DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS desks CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

CREATE TABLE roles (
  role_id    SERIAL PRIMARY KEY,
  role_type  TEXT NOT NULL UNIQUE
             CHECK (role_type IN ('member', 'admin', 'guest'))
);

CREATE TABLE users (
  user_id     SERIAL PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role_id     INTEGER NOT NULL REFERENCES roles(role_id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE desks (
  desk_id      SERIAL PRIMARY KEY,
  desk_number  INTEGER NOT NULL UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reservations (
  reservation_id     SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(user_id),
  desk_id            INTEGER NOT NULL REFERENCES desks(desk_id),
  starts_at          TIMESTAMP NOT NULL,
  ends_at            TIMESTAMP NOT NULL,
  status             TEXT NOT NULL DEFAULT 'approved'
                     CHECK (status IN ('pending', 'approved', 'denied', 'canceled')),
  confirmation_code  TEXT NOT NULL UNIQUE,
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

-- Availability lookups filter by day and desk; this covers the common path.
CREATE INDEX reservations_desk_time_idx
  ON reservations (desk_id, starts_at);

COMMIT;
