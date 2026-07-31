-- Sponsored external visitors.
--
-- Guests are users with role 'guest': they get the booking flow, the audit
-- trail, the confirmation code and the no-double-booking guarantee without a
-- parallel concept, and the role has existed and been empty since the schema
-- was written.
--
-- Safe to run more than once.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(user_id);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS sponsored_by_user_id INTEGER REFERENCES users(user_id);
