import { useState, useEffect, useCallback } from 'react';
import { CalendarX, Search, Pencil } from 'lucide-react';
import { getAllReservations, adminCancelReservation } from '../api/client';
import EditReservationModal from './EditReservationModal';
import { resourceLabel } from '../lib/resourceLabel';

// Ongoing first, because it is the only one that answers "right now" — and the
// state that had nowhere to live before, since Upcoming meant "not finished"
// and so claimed anything underway. The four partition: a booking is in exactly
// one of ongoing, upcoming and past, and All is their sum.
const SCOPES = [
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

// Every row here is approved, so the status would say the same thing on all of
// them. How the booking came about is the useful distinction — and none of
// these is better or worse than another, so the colours are distinguishing
// rather than semantic.
// walk_up has been written to the database since the front desk was built and
// was missing from here, so a desk claimed in person fell through to the raw
// column value and rendered as "WALK_UP". It is a distinct way for a booking to
// exist — nobody approved it, somebody was simply standing there — which is
// exactly what an admin reading this list wants to be told.
const SOURCE_LABELS = {
  user: 'User Booked',
  admin: 'Admin Booked',
  recurring: 'Recurring',
  walk_up: 'Front Desk',
};

const SOURCE_STYLES = {
  user: 'bg-surface-panel text-ink-body',
  admin: 'bg-sky-100 text-sky-800',
  recurring: 'bg-indigo-100 text-indigo-800',
  walk_up: 'bg-amber-100 text-amber-800',
};

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Everything listed is approved, so the only thing that stops an admin acting
// on a booking is it having already finished.
const isLive = (r) => new Date(`${r.date}T00:00:00`).setMinutes(r.endMin) > Date.now();

// One booking. Rendered alone for a one-off, and once per occurrence inside an
// expanded series, where `compact` drops the chip the group header already shows.
function BookingCard({ r, confirmingId, setConfirmingId, busyId, onCancel, onEdit, compact = false }) {
  return (
      <div className={compact ? 'bg-surface-panel rounded-lg p-3' : 'bg-white rounded-lg p-3.5'}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-ink">{r.user}</p>
              {/* Amber, unlike the source chips beside it, which are only
                  distinguishing. This one means something: the person at that
                  desk is not staff. */}
              {r.external && (
                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  External
                </span>
              )}
              <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${SOURCE_STYLES[r.bookingSource] || 'bg-surface-panel text-ink-body'}`}>
                {SOURCE_LABELS[r.bookingSource] || r.bookingSource}
              </span>
            </div>

            {/* Named on the booking, not tucked in a log nobody opens. The point
                of sponsorship is that the answer to "who let this person in" is
                visible beside the person. */}
            {r.external && (
              <p className="text-amber-800 text-xs mt-0.5">
                {r.organization ? `${r.organization} · ` : ''}
                Sponsored by {r.sponsor || 'an administrator no longer on file'}
              </p>
            )}
            {/* Date, then time, then desk — when and then where, which is
                the order someone reads a booking in. */}
            <p className="text-ink-muted text-sm mt-0.5">
              {formatDate(r.date)} &middot;{' '}
              {formatMinutes(r.startMin)} - {formatMinutes(r.endMin)} &middot;{' '}
              {resourceLabel(r)}
            </p>
            <p className="font-mono text-xs text-ink-muted mt-1 select-all">Confirmation Code: {r.confirmationCode}</p>
          </div>

          {isLive(r) && (
            confirmingId === r.id ? (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onCancel(r.id)}
                  disabled={busyId === r.id}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  {busyId === r.id ? 'Cancelling…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={busyId === r.id}
                  className="border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  Keep
                </button>
              </div>
            ) : (
              // Editing is reversible and the log keeps both values, so it
              // needs no confirm step. Cancelling loses the booking with
              // no notification, so that one keeps its.
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onEdit(r)}
                  className="border border-surface-line text-ink-body hover:bg-surface-panel text-xs font-semibold px-3 py-1.5 rounded transition flex items-center gap-1.5"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => setConfirmingId(r.id)}
                  className="border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  Cancel
                </button>
              </div>
            )
          )}
        </div>
      </div>
  );
}


export default function ReservationsTab({ dataVersion = 0, onChanged }) {
  // Ongoing, matching the first scope button rather than contradicting it.
  //
  // The tab opened on Upcoming, which means `starts_at > now()` — a filter a
  // front-desk claim can never satisfy, because it starts the moment it is
  // made. So a desk claimed in person was written, logged, and then absent from
  // the first screen anybody checked, which read as it never having been
  // recorded at all. It was only ever one scope away.
  const [scope, setScope] = useState('ongoing');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  // Nobody emails the holder when their booking moves, so the admin who did it
  // is the only person who knows. Say what changed rather than silently
  // redrawing the row.
  const [changed, setChanged] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getAllReservations(scope)
      .then(setReservations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scope]);

  // dataVersion is a reason to refetch, not an input to load, so it belongs on
  // the effect rather than in the callback's dependencies.
  useEffect(() => { load(); }, [load, dataVersion]);

  const handleCancel = async (id) => {
    setBusyId(id);
    try {
      await adminCancelReservation(id);
      await load();
      setConfirmingId(null);
      // An override writes a log entry, so the Logs tab is now stale too.
      onChanged?.();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleSaved = async (result, { deskChanged, timeChanged }) => {
    const moved = [deskChanged && 'desk', timeChanged && 'time'].filter(Boolean).join(' and ');
    setChanged(`${editing.user}'s ${moved} updated. They have not been notified.`);
    await load();
    onChanged?.();
  };

  // Matches name, desk or code, so an admin can search by whatever the person
  // on the phone happens to know.
  const term = filter.trim().toLowerCase();
  const matching = term
    ? reservations.filter((r) =>
        // The name as well as the number, so searching "511A" or "Conference"
        // finds a room booking. Matching only "desk# 13" meant the one term
        // anybody would actually type returned nothing.
        [r.user, resourceLabel(r), `desk# ${r.deskNumber}`, r.confirmationCode]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term))
      )
    : reservations;

  // Schedule occurrences do not belong here.
  //
  // They are real bookings holding real desks, which is why they were kept for a
  // while — folded into one row per schedule so a single intern's pattern could
  // not bury everything else. But an arrangement is managed on the Schedules tab,
  // and having it in two places meant two front doors onto ending one, and a row
  // here whose only remaining action was a link to the other tab. A row that just
  // points somewhere else is a signpost, not a feature.
  //
  // So this tab is one-off bookings, the Schedules tab is schedules, and neither
  // restates the other. The counts below say "one-off" for the same reason: with
  // schedule days excluded, this total is not office usage and should not read as
  // if it were.
  const oneOff = matching.filter((r) => !r.seriesId);
  const oneOffTotal = reservations.filter((r) => !r.seriesId).length;

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink">One-off bookings</h1>
        <div className="flex rounded-lg border border-surface-line overflow-hidden bg-white">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-4 py-1.5 text-sm font-semibold transition
                ${scope === s.key ? 'bg-mqd-btn text-white' : 'text-ink-body hover:bg-surface-panel'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name, desk or code"
          className="w-full bg-white border border-surface-line rounded-lg pl-9 pr-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
        />
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          {error}
        </p>
      )}

      {changed && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm mb-3 flex items-start justify-between gap-3">
          <span>{changed}</span>
          <button onClick={() => setChanged(null)} className="font-semibold shrink-0 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-ink-muted text-sm text-center py-10">Loading reservations…</p>
      ) : oneOff.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarX className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {term
              ? 'No one-off booking matches that search.'
              : `No ${scope === 'all' ? '' : scope} one-off bookings.`}
          </p>
          <p className="text-ink-muted text-xs max-w-sm">
            Recurring schedules and the days they hold are on the Schedules tab.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {oneOff.map((r) => (
            <BookingCard
              key={r.id}
              r={r}
              confirmingId={confirmingId}
              setConfirmingId={setConfirmingId}
              busyId={busyId}
              onCancel={handleCancel}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditReservationModal
          reservation={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {/* "one-off" is load-bearing, not decoration. Schedule days are excluded,
          and 63 of 64 upcoming rows once belonged to five schedules — a count
          reading "12 bookings" would badly understate the office if anybody took
          it for utilisation. */}
      <p className="text-ink-muted text-xs mt-4">
        Showing {oneOff.length} {scope === 'all' ? '' : `${scope} `}
        one-off booking{oneOff.length === 1 ? '' : 's'}
        {oneOff.length !== oneOffTotal && ` of ${oneOffTotal}`}. Recurring schedules
        are on the Schedules tab.
      </p>
    </div>
  );
}
