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

const deskColor = (status, selected) => {
  if (selected) return 'bg-mqd-title ring-2 ring-mqd-title/40';
  if (status === 'booked') return 'bg-rose-500 opacity-85';
  if (status === 'current') return 'bg-sky-500';
  if (status === 'partial') return 'bg-amber-400';
  return 'bg-emerald-500';
};

const LEGEND = [
  { color: 'bg-emerald-500', label: 'Available' },
  { color: 'bg-rose-500',    label: 'Booked for this time' },
  { color: 'bg-sky-500',     label: 'Current desk', onlyWithCurrent: true },
];

export function DeskMapLegend({ showCurrent = false, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-body ${className}`}>
      {LEGEND.filter((item) => showCurrent || !item.onlyWithCurrent).map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className={`w-4 h-3 rounded ${item.color}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// `compact` shows bare numbers, for when the map is narrower than a page.
export default function DeskMap({
  desks,
  selectedDeskId = null,
  onSelect,
  loading = false,
  compact = false,
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
        // 'partial' is shown but not offered: a recurring pattern needs a desk
        // free on every one of its days, so a desk that is nearly free is still
        // not usable. Only the booking flows produce 'partial'.
        const clickable = desk.status === 'available' || desk.status === 'current';

        return (
          <button
            key={desk.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelect?.(desk)}
            aria-label={`Desk ${desk.number}, ${desk.status}`}
            className={`absolute flex items-center justify-center rounded text-white font-bold
              shadow-md transition select-none whitespace-nowrap overflow-hidden
              ${deskColor(desk.status, isSelected)}
              ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed'}`}
            style={{
              left: position.left,
              top: position.top,
              transform: 'translate(-50%, -50%)',
              width: '5.5%',
              height: '10%',
              fontSize: 'clamp(0.4rem, 1.1vw, 0.6rem)',
              padding: '0 4px',
            }}
          >
            {compact ? desk.number : (
              <>
                <span className="hidden sm:inline">{desk.label}</span>
                <span className="sm:hidden">{desk.number}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
