-- Check-in, and releasing a desk nobody turned up for.
--
-- The exclusion constraint is already scoped to WHERE status IN ('pending',
-- 'approved'), so releasing a booking is a status change and nothing else: the
-- row falls out of the constraint and the desk is free. Reclaiming one puts it
-- back in, and the constraint refuses it if somebody else took the slot.
--
-- Safe to run more than once.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- 'no_show' rather than reusing 'expired'. That one means nobody reviewed the
-- request in time, and holders are shown exactly those words — telling somebody
-- who was approved and simply arrived late that their request was never
-- reviewed would be false in the one place people go for the truth.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending','approved','denied','expired','canceled','no_show'));

-- A desk claimed at the front desk or at the cubicle itself. Distinct from
-- 'admin' because nobody decided anything: the person was standing there.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_booking_source_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_booking_source_check
  CHECK (booking_source IN ('user', 'admin', 'recurring', 'walk_up'));

-- Finding the bookings due a release: today's, live, nobody checked in.
CREATE INDEX IF NOT EXISTS reservations_awaiting_checkin_idx
  ON reservations (starts_at)
  WHERE status = 'approved' AND checked_in_at IS NULL;
