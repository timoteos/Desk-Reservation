-- Conference rooms, as a type of row rather than a table of their own.
--
-- A room is booked the way a desk is: one space, one window, one person
-- answerable for it. The exclusion constraint that stops two people taking the
-- same space is keyed on desk_id and already covers both — a second table would
-- mean a second copy of that guarantee, and the second copy is the one that
-- gets forgotten.
--
-- desk_number stays NOT NULL UNIQUE and the rooms take numbers of their own, so
-- every existing route, lookup and join keeps working untouched. What separates
-- them is resource_type, and nothing else.
--
-- Safe to run more than once.

-- DEFAULT 'desk' so the twelve rows already there are correct with no backfill,
-- and every query that has not yet been made type-aware keeps returning exactly
-- what it returns today.
ALTER TABLE desks ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'desk';
ALTER TABLE desks DROP CONSTRAINT IF EXISTS desks_resource_type_check;
ALTER TABLE desks ADD CONSTRAINT desks_resource_type_check
  CHECK (resource_type IN ('desk', 'room'));

-- What people call the space. Null for desks, which are known by their number.
ALTER TABLE desks ADD COLUMN IF NOT EXISTS display_name TEXT;

-- The same space on the floor plan, where there is room for a token and not a
-- sentence: "1" for a desk, "511A" for a room. Stored rather than derived from
-- display_name, because taking the last word of a name is a guess that happens
-- to work for "Conference Room 511A" and fails for "Ocean View Suite".
--
-- Null for desks, which use their number.
ALTER TABLE desks ADD COLUMN IF NOT EXISTS short_name TEXT;

-- How many the room seats. Null for desks, which seat one by construction.
ALTER TABLE desks ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE desks DROP CONSTRAINT IF EXISTS desks_capacity_check;
ALTER TABLE desks ADD CONSTRAINT desks_capacity_check
  CHECK (capacity IS NULL OR capacity > 0);

-- Without this a room with no name renders as "Desk# 13" on a screen in the
-- lobby — a wrong answer rather than an error, which is the failure this
-- project keeps getting caught by. Desks are unaffected: they are named by
-- their number and carry no display_name at all.
ALTER TABLE desks DROP CONSTRAINT IF EXISTS room_has_display_name;
ALTER TABLE desks ADD CONSTRAINT room_has_display_name
  CHECK (resource_type <> 'room' OR display_name IS NOT NULL);

-- Same reasoning for the map: a room with no short name would fall back to its
-- desk number and put "13" on the floor plan, which is an internal key nobody
-- reads off a door.
ALTER TABLE desks DROP CONSTRAINT IF EXISTS room_has_short_name;
ALTER TABLE desks ADD CONSTRAINT room_has_short_name
  CHECK (resource_type <> 'room' OR short_name IS NOT NULL);

-- Every listing, availability check and auto-assignment now filters on type.
CREATE INDEX IF NOT EXISTS desks_resource_type_idx ON desks (resource_type);
