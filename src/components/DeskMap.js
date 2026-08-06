// The office floor plan with desks overlaid on it, shared by the public booking
// flow and the admin dashboard. Both need to answer the same question — which
// desks are free for this window — so they share the positions and the colours
// rather than keeping two copies that drift apart.

// Desk positions as % of the floor plan image — left/top mark the CENTRE of
// each cubicle, measured from the image pixels (bay pitch ~88px of 1388).
// transform: translate(-50%, -50%) keeps the label centred on that point.
//
// Positions stay here rather than in the database until the admin map editor
// exists; keyed by desk number so they survive the desks coming from the API.
export const DESK_POSITIONS = {
  1:  { left: '23.9%', top: '22%' },
  2:  { left: '30.3%', top: '22%' },
  3:  { left: '36.7%', top: '22%' },
  4:  { left: '43.1%', top: '22%' },
  5:  { left: '49.5%', top: '22%' },
  6:  { left: '55.8%', top: '22%' },
  7:  { left: '62.3%', top: '22%' },
  8:  { left: '68.6%', top: '22%' },
  9:  { left: '51.6%', top: '75%' },
  10: { left: '58.2%', top: '75%' },
  11: { left: '64.4%', top: '75%' },
  12: { left: '71%',   top: '75%' },

  // Conference rooms. Same map, same coordinate space — they are rooms on this
  // floor, not a separate diagram — but wider markers, because a room is
  // labelled by name and "Conference Room 511A" will not fit in a desk square.
  13: { left: '30.6%', top: '79%' },
  14: { left: '91.2%', top: '24%' },
};

// The map is a diagram, so a marker carries a token rather than a sentence:
// "4" for a desk, "511A" for a room. The full names — "Desk# 4", "Conference
// Room 511A" — belong anywhere a screen names the space in prose, and come
// through as `label`.
//
// Rooms get a little more width for four characters and the same height as a
// desk, so the markers read as one system instead of two.
export const MARKER_SIZE = {
  desk: { width: '5.5%', height: '10%' },
  room: { width: '8.5%', height: '10%' },
};

// Two ranges collide when each starts before the other ends.
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

// Tags each desk with how it stands for one time window.
//
// `currentDeskId` marks the desk a booking already holds, and
// `ignoreReservationId` drops that booking from the conflict check — without it
// a reservation being edited would report its own desk as taken.
export const deskStatuses = (
  desks,
  reservations,
  startMin,
  endMin,
  { currentDeskId, ignoreReservationId } = {}
) =>
  desks.map((desk) => {
    // Conflicts are checked before "current", because moving a booking to a new
    // time can leave someone else on the desk it used to hold. Marking it
    // current regardless would hide that and let the save fail on the server.
    const taken = reservations.some(
      (r) =>
        String(r.id) !== String(ignoreReservationId) &&
        r.deskNumber === desk.number &&
        overlaps(startMin, endMin, r.startMin, r.endMin)
    );
    if (taken) return { ...desk, status: 'booked' };
    if (currentDeskId != null && String(desk.id) === String(currentDeskId)) {
      return { ...desk, status: 'current' };
    }
    return { ...desk, status: 'available' };
  });

// Statuses are database-shaped; a screen reader should not have to say
// "in underscore use".
const STATUS_WORDS = {
  in_use: 'in use',
  reserved: 'reserved, nobody here yet',
};
const statusWords = (status) => STATUS_WORDS[status] || status;

const deskColor = (status, selected) => {
  if (selected) return 'bg-mqd-title ring-2 ring-mqd-title/40';
  if (status === 'booked') return 'bg-rose-500 opacity-85';
  // Live statuses, for a map showing the floor as it stands rather than a
  // window somebody is choosing. `in_use` is somebody in the seat; `reserved`
  // is booked with nobody there yet, which is a different thing to walk past.
  if (status === 'in_use') return 'bg-rose-500 opacity-85';
  if (status === 'reserved') return 'bg-amber-400';
  if (status === 'current') return 'bg-sky-500';
  if (status === 'partial') return 'bg-amber-400';
  return 'bg-emerald-500';
};

const LEGEND = [
  { color: 'bg-emerald-500', label: 'Available' },
  { color: 'bg-rose-500',    label: 'Booked for this time' },
  { color: 'bg-sky-500',     label: 'Current desk', onlyWithCurrent: true },
];

// The live floor reads differently: three states about right now, not two about
// a window being chosen.
const LIVE_LEGEND = [
  { color: 'bg-emerald-500', label: 'Free' },
  { color: 'bg-amber-400',   label: 'Reserved, nobody here yet' },
  { color: 'bg-rose-500',    label: 'In use' },
];

export function DeskMapLegend({ showCurrent = false, live = false, className = '' }) {
  const items = live ? LIVE_LEGEND : LEGEND;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-body ${className}`}>
      {items.filter((item) => showCurrent || !item.onlyWithCurrent).map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className={`w-4 h-3 rounded ${item.color}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// `canSelect` narrows what may be picked without hiding the rest. A conference
// room on the front desk kiosk, or on an admin's screen while they are booking
// for a visitor, still shows its live status — it just cannot be chosen. Hiding
// it instead would leave somebody wondering where the rooms went, and answering
// "is 511A free?" is most of what that screen is for.
export default function DeskMap({
  desks,
  selectedDeskId = null,
  onSelect,
  loading = false,
  canSelect = () => true,
  unselectableHint = () => undefined,
}) {
  return (
    <div className="relative">
      {/* Map image at its natural aspect ratio so % overlays track it exactly */}
      <img
        src={`${process.env.PUBLIC_URL}/office-map.png`}
        alt="Office floor plan"
        className="block w-full h-auto rounded-lg border border-surface-line"
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
          <p className="text-ink-body text-sm font-medium">Checking desk availability…</p>
        </div>
      )}

      {desks.map((desk) => {
        const position = DESK_POSITIONS[desk.number];
        if (!position) return null;

        const isSelected = selectedDeskId != null && String(selectedDeskId) === String(desk.id);
        const isRoom = desk.resourceType === 'room';
        // A room is announced by its name. A desk keeps "Desk 4" rather than its
        // "Desk# 4" label, because a screen reader reads the hash aloud as
        // "number sign" — the same reason 'in_use' is spoken as "in use".
        const accessibleName = isRoom ? desk.label : `Desk ${desk.number}`;
        // What the marker itself shows. Falls back to the number so a caller
        // that has not been updated to pass shortLabel still renders a desk
        // correctly rather than an empty square.
        const shortLabel = desk.shortLabel ?? String(desk.number);
        // 'partial' is shown but not offered: a recurring pattern needs a desk
        // free on every one of its days, so a desk that is nearly free is still
        // not usable. Only the booking flows produce 'partial'.
        const freeToPick =
          desk.status === 'available' || desk.status === 'current' || desk.status === 'free';
        const allowedHere = canSelect(desk);
        const clickable = freeToPick && allowedHere;
        // A room refused because of who it is for reads differently from one
        // refused because somebody is in it, so say which.
        const hint = allowedHere ? undefined : unselectableHint(desk);

        return (
          <button
            key={desk.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelect?.(desk)}
            title={hint}
            aria-label={`${accessibleName}, ${statusWords(desk.status)}${hint ? `. ${hint}` : ''}`}
            className={`absolute flex items-center justify-center rounded text-white font-bold
              shadow-md transition select-none overflow-hidden
              ${deskColor(desk.status, isSelected)}
              ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed'}`}
            style={{
              left: position.left,
              top: position.top,
              transform: 'translate(-50%, -50%)',
              ...MARKER_SIZE[isRoom ? 'room' : 'desk'],
              fontSize: 'clamp(0.4rem, 1.1vw, 0.6rem)',
              padding: '0 4px',
              whiteSpace: 'nowrap',
            }}
          >
            {/* One token at every breakpoint. The map used to shrink "Desk# 4"
                to "4" only on small screens, which made a wide map read as a
                paragraph of repeated words — the number was always the part
                doing the work. */}
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}
