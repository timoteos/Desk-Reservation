import { useState, useEffect, useCallback } from 'react';
import { CalendarX, Search, Pencil } from 'lucide-react';
import { getAllReservations, adminCancelReservation, adminCancelSeries } from '../api/client';
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const shortDay = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Everything listed is approved, so the only thing that stops an admin acting
// on a booking is it having already finished.
const isLive = (r) => new Date(`${r.date}T00:00:00`).setMinutes(r.endMin) > Date.now();

// One entry per pattern rather than one per generated booking.
//
// A weekly schedule materialises as a real row for each occurrence, because the
// exclusion constraint can only compare rows — but that meant a single intern's
// schedule filled the tab. In testing, 63 of 64 upcoming rows belonged to five
// patterns. Grouping is presentational only; the rows underneath are untouched.
//
// The pattern is derived from its occurrences rather than fetched, since each
// day of a schedule can carry its own hours and the occurrences already say so.
const groupByschedule = (rows) => {
  const groups = [];
  const bySchedule = new Map();

  rows.forEach((r) => {
    if (!r.seriesId) {
      groups.push({ key: `one-${r.id}`, series: false, lead: r, items: [r] });
      return;
    }
    let group = bySchedule.get(r.seriesId);
    if (!group) {
      group = { key: `series-${r.seriesId}`, series: true, lead: r, items: [] };
      bySchedule.set(r.seriesId, group);
      groups.push(group);
    }
    group.items.push(r);
  });

  groups.forEach((g) => {
    if (!g.series) return;
    g.items.sort((a, b) => a.date.localeCompare(b.date));
    g.lead = g.items[0];
    g.first = g.items[0].date;
    g.last = g.items[g.items.length - 1].date;
    // Distinct weekday-and-hours combinations, in week order.
    const seen = new Map();
    g.items.forEach((r) => {
      const day = new Date(`${r.date}T00:00:00`).getDay();
      const key = `${day}-${r.startMin}-${r.endMin}`;
      if (!seen.has(key)) seen.set(key, { day, startMin: r.startMin, endMin: r.endMin });
    });
    g.pattern = [...seen.values()].sort((a, b) => a.day - b.day || a.startMin - b.startMin);
    g.liveCount = g.items.filter(isLive).length;
  });

  return groups;
};


// One booking. Rendered alone for a one-off, and once per occurrence inside an
// expanded series, where `compact` drops the chip the group header already shows.
function BookingCard({ r, confirmingId, setConfirmingId, busyId, onCancel, onEdit, compact = false }) {
  return (
      <div className={compact ? 'bg-surface-panel rounded-lg p-3' : 'bg-white rounded-lg p-3.5'}>
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


// A whole recurring pattern as one entry. Collapsed it answers what an admin
// scanning the list needs — who, which desk, which days, over what span — and
// expands to the individual bookings when they need a specific one.
function SeriesCard({
  group, expanded, onToggle, confirmingId, setConfirmingId,
  busyId, onCancel, onCancelSeries, onEdit,
}) {
  const { lead, items, pattern, first, last, liveCount, key } = group;
  const confirmingSeries = confirmingId === key;

  return (
    <div className="bg-white rounded-lg p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">{lead.user}</p>
            <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${SOURCE_STYLES.recurring}`}>
              {SOURCE_LABELS.recurring}
            </span>
          </div>

          <div className="text-ink-muted text-sm mt-0.5">
            {pattern.map((p) => (
              <p key={`${p.day}-${p.startMin}`}>
                {DAY_NAMES[p.day]} &middot; {formatMinutes(p.startMin)} - {formatMinutes(p.endMin)}
              </p>
            ))}
          </div>

          <p className="text-ink-muted text-sm mt-1">
            {shortDay(first)} &ndash; {shortDay(last)} &middot; Desk# {lead.deskNumber} &middot;{' '}
            {items.length} booking{items.length === 1 ? '' : 's'}
          </p>

          <button
            onClick={onToggle}
            className="text-mqd-700 text-xs font-semibold mt-1.5 hover:underline"
          >
            {expanded ? 'Hide bookings' : `Show all ${items.length} bookings`}
          </button>
        </div>

        {liveCount > 0 && (
          confirmingSeries ? (
            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-red-700 text-xs max-w-[13rem] text-right">
                Cancels {liveCount} remaining booking{liveCount === 1 ? '' : 's'} and ends the
                schedule. Past ones are kept.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onCancelSeries(group)}
                  disabled={busyId === key}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  {busyId === key ? 'Cancelling…' : 'Cancel series'}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={busyId === key}
                  className="border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-xs font-semibold px-3 py-1.5 rounded transition"
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingId(key)}
              className="shrink-0 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded transition"
            >
              Cancel series
            </button>
          )
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-surface-line">
          {items.map((r) => (
            <BookingCard
              key={r.id}
              r={r}
              compact
              confirmingId={confirmingId}
              setConfirmingId={setConfirmingId}
              busyId={busyId}
              onCancel={onCancel}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [expandedSeries, setExpandedSeries] = useState(null);
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

  // Cancelling a series is one action rather than one per occurrence. A holder
  // with a 90-day pattern has dozens of confirmation codes and no way to end the
  // whole thing, which is why an expired contract used to keep its desk.
  const handleCancelSeries = async (group) => {
    setBusyId(group.key);
    try {
      const result = await adminCancelSeries(group.lead.seriesId);
      setChanged(
        `${group.lead.user}'s recurring schedule ended. ` +
        `${result.bookingsCanceled} upcoming booking${result.bookingsCanceled === 1 ? '' : 's'} ` +
        'released. They have not been notified.'
      );
      setConfirmingId(null);
      await load();
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
  // on the phone happens to know. Applied before grouping, so searching a single
  // occurrence's code still finds it — the group then shows just that booking.
  const term = filter.trim().toLowerCase();
  const matching = term
    ? reservations.filter((r) =>
        [r.user, `desk# ${r.deskNumber}`, r.confirmationCode]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term))
      )
    : reservations;

  const groups = groupByschedule(matching);

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
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarX className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {term ? 'Nothing matches that search.' : `No ${scope === 'all' ? '' : scope} approved reservations.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {groups.map((g) =>
            g.series ? (
              <SeriesCard
                key={g.key}
                group={g}
                expanded={expandedSeries === g.key}
                onToggle={() => setExpandedSeries(expandedSeries === g.key ? null : g.key)}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                busyId={busyId}
                onCancel={handleCancel}
                onCancelSeries={handleCancelSeries}
                onEdit={setEditing}
              />
            ) : (
              <BookingCard
                key={g.key}
                r={g.lead}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                busyId={busyId}
                onCancel={handleCancel}
                onEdit={setEditing}
              />
            )
          )}
        </div>
      )}

      {editing && (
        <EditReservationModal
          reservation={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Both numbers, because a recurring pattern is one entry standing for many
          bookings and either figure alone would mislead. */}
      <p className="text-ink-muted text-xs mt-4">
        Showing {groups.length} {groups.length === 1 ? 'entry' : 'entries'} covering{' '}
        {matching.length} {scope === 'all' ? '' : `${scope} `}
        booking{matching.length === 1 ? '' : 's'}
        {matching.length !== reservations.length && ` of ${reservations.length}`}.
      </p>
    </div>
  );
}
