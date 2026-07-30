import { useState, useEffect, useCallback } from 'react';
import { CalendarX, Search, Pencil } from 'lucide-react';
import { getAllReservations, adminCancelReservation } from '../api/client';
import EditReservationModal from './EditReservationModal';

const SCOPES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

// Every row here is approved, so the status would say the same thing on all of
// them. How the booking came about is the useful distinction — and none of
// these is better or worse than another, so the colours are distinguishing
// rather than semantic.
const SOURCE_LABELS = {
  user: 'User Booked',
  admin: 'Admin Booked',
  recurring: 'Recurring',
};

const SOURCE_STYLES = {
  user: 'bg-surface-panel text-ink-body',
  admin: 'bg-sky-100 text-sky-800',
  recurring: 'bg-indigo-100 text-indigo-800',
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

// dataVersion changes when an admin action elsewhere on the dashboard has
// altered reservations; onChanged reports this tab's own overrides back so the
// rest of the dashboard can do the same.
export default function ReservationsTab({ dataVersion = 0, onChanged }) {
  const [scope, setScope] = useState('upcoming');
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
  const shown = term
    ? reservations.filter((r) =>
        [r.user, `desk# ${r.deskNumber}`, r.confirmationCode]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term))
      )
    : reservations;

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink ">Reservations</h1>
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
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarX className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {term ? 'Nothing matches that search.' : `No ${scope === 'all' ? '' : scope} approved reservations.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {shown.map((r) => (
            <div key={r.id} className="bg-white rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink">{r.user}</p>
                    <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${SOURCE_STYLES[r.bookingSource] || 'bg-surface-panel text-ink-body'}`}>
                      {SOURCE_LABELS[r.bookingSource] || r.bookingSource}
                    </span>
                  </div>
                  {/* Date, then time, then desk — when and then where, which is
                      the order someone reads a booking in. */}
                  <p className="text-ink-muted text-sm mt-0.5">
                    {formatDate(r.date)} &middot;{' '}
                    {formatMinutes(r.startMin)} - {formatMinutes(r.endMin)} &middot;{' '}
                    Desk# {r.deskNumber}
                  </p>
                  <p className="font-mono text-xs text-ink-muted mt-1 select-all">Confirmation Code: {r.confirmationCode}</p>
                </div>

                {isLive(r) && (
                  confirmingId === r.id ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleCancel(r.id)}
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
                        onClick={() => setEditing(r)}
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

      <p className="text-ink-muted text-xs mt-4">
        Showing {shown.length} of {reservations.length}
        {scope === 'all' ? '' : ` ${scope}`} reservation{reservations.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
