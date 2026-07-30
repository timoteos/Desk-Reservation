import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Search, AlertTriangle, Pencil } from 'lucide-react';
import { getSchedules, adminCancelSeries } from '../api/client';
import EditScheduleModal from './EditScheduleModal';
import ScheduleDays from './ScheduleDays';

// A schedule's state is not a tense, so this is not the Reservations tab's
// Upcoming/Past/All. An arrangement running August to October is neither
// upcoming nor past — it is active.
const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
  { key: 'all', label: 'All' },
];

const STATE_LABELS = {
  active: 'Active',
  upcoming: 'Not started',
  pending: 'Pending',
  ended: 'Ended',
  canceled: 'Cancelled',
  denied: 'Denied',
};

const STATE_STYLES = {
  active: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-sky-100 text-sky-800',
  pending: 'bg-amber-100 text-amber-800',
  ended: 'bg-surface-panel text-ink-body',
  canceled: 'bg-surface-panel text-ink-body',
  denied: 'bg-red-100 text-red-800',
};

// Which filter a state belongs under.
//
// Active means running now, and Upcoming means approved but not started yet.
// Those were one filter, which buried a genuine distinction: a schedule
// beginning in a fortnight already holds its desks but nobody is sitting there.
//
// Ended and cancelled read as the same thing to someone reviewing commitments —
// both are over — so they share a filter.
const FILTER_MATCHES = {
  active: ['active'],
  upcoming: ['upcoming'],
  ended: ['ended', 'canceled', 'denied'],
};

// Awaiting a decision is the Requests tab's business, not this one's. Listing
// them here duplicated that tab while offering none of its actions, so the row
// was something to look at and not act on. They are counted and pointed at
// instead, which keeps this tab about arrangements that have been decided
// without pretending the pending ones do not exist.
const DECIDED = ['active', 'upcoming', 'ended', 'canceled', 'denied'];

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
};

const shortDay = (dateStr) =>
  dateStr
    ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

// "Monday, Tuesday, Wednesday" collapses to "Mon–Wed" only when the days really
// are consecutive; a Mon/Wed/Fri pattern has to be listed.
const describeDays = (pattern) => {
  const nums = pattern.map((p) => p.dayNumber);
  const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  const short = (d) => d.slice(0, 3);
  if (consecutive && pattern.length > 2) {
    return `${short(pattern[0].day)}–${short(pattern[pattern.length - 1].day)}`;
  }
  return pattern.map((p) => short(p.day)).join(', ');
};

// Hours are shown once when every day shares them, and per day when they differ
// — the point of per-day times is half days, so flattening them would hide it.
const describeHours = (pattern) => {
  const distinct = new Set(pattern.map((p) => `${p.startMin}-${p.endMin}`));
  if (distinct.size === 1) {
    return [`${formatMinutes(pattern[0].startMin)} – ${formatMinutes(pattern[0].endMin)}`];
  }
  return pattern.map(
    (p) => `${p.day.slice(0, 3)} ${formatMinutes(p.startMin)} – ${formatMinutes(p.endMin)}`
  );
};

export default function SchedulesTab({ dataVersion = 0, onChanged }) {
  const [schedules, setSchedules] = useState([]);
  const [filter, setFilter] = useState('active');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [expandedDays, setExpandedDays] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getSchedules()
      .then(setSchedules)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, dataVersion]);

  const handleEnd = async (schedule) => {
    setBusyId(schedule.id);
    try {
      const result = await adminCancelSeries(schedule.id);
      setNotice(
        `${schedule.name}'s schedule ended. ` +
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

  const handleSaved = async (schedule, result) => {
    setNotice(
      `${schedule.name}'s schedule updated — Desk# ${result.deskNumber}, `
      + `${result.regenerated} booking${result.regenerated === 1 ? '' : 's'} from today onward. `
      + (result.cappedAtCeiling
        ? `Capped at a year, so it runs to ${result.activeUntil}. `
        : '')
      + 'Days already worked are unchanged. They have not been notified.'
    );
    await load();
    onChanged?.();
  };

  const search = term.trim().toLowerCase();
  const decided = schedules.filter((s) => DECIDED.includes(s.state));
  const awaitingDecision = schedules.filter((s) => s.state === 'pending');

  const shown = decided
    .filter((s) => filter === 'all' || FILTER_MATCHES[filter].includes(s.state))
    .filter((s) =>
      !search ||
      [s.name, s.email, `desk# ${s.deskNumber}`]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(search))
    );

  // The warning that justifies this view existing. An open-ended schedule stops
  // generating when its horizon runs out, and nothing else in the interface says
  // when — the holder would find out by arriving to no desk.
  // Upcoming counts too: a schedule starting next month with no end date will
  // stop generating just the same, and it is easier to extend before it has run.
  const openEnded = decided.filter(
    (s) => s.openEnded && (s.state === 'active' || s.state === 'upcoming')
  );

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink">Schedules</h1>
        <div className="flex rounded-lg border border-surface-line overflow-hidden bg-white">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 text-sm font-semibold transition
                ${filter === f.key ? 'bg-mqd-btn text-white' : 'text-ink-body hover:bg-surface-panel'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-ink-muted text-sm mb-4">
        Standing arrangements — who holds a desk, and until when.
      </p>

      {openEnded.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {openEnded.length} schedule{openEnded.length === 1 ? ' has' : 's have'} no end date.
            {' '}Bookings stop generating on{' '}
            {[...new Set(openEnded.map((s) => shortDay(s.generatedThrough)))].join(' and ')}
            {' '}and will not resume.
          </span>
        </div>
      )}

      {awaitingDecision.length > 0 && (
        <p className="text-ink-body bg-surface-page border border-surface-line rounded-lg px-4 py-3 text-sm mb-3">
          {awaitingDecision.length} schedule{awaitingDecision.length === 1 ? '' : 's'} awaiting a
          decision {awaitingDecision.length === 1 ? 'is' : 'are'} in <strong>Requests</strong>,
          where {awaitingDecision.length === 1 ? 'it' : 'they'} can be approved or denied.
        </p>
      )}

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name, email or desk"
          className="w-full bg-white border border-surface-line rounded-lg pl-9 pr-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
        />
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          {error}
        </p>
      )}

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm mb-3 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="font-semibold shrink-0 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-ink-muted text-sm text-center py-10">Loading schedules…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarClock className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {search ? 'Nothing matches that search.' : `No ${filter === 'all' ? '' : filter} schedules.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {shown.map((s) => {
            const over = ['ended', 'canceled', 'denied'].includes(s.state);
            return (
              <div key={s.id} className={`bg-white rounded-lg p-3.5 ${over ? 'opacity-75' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink">{s.name}</p>
                      <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATE_STYLES[s.state]}`}>
                        {s.state === 'upcoming' && s.activeFrom
                          ? `Starts ${shortDay(s.activeFrom)}`
                          : STATE_LABELS[s.state]}
                      </span>
                    </div>

                    <p className="text-ink-muted text-sm mt-0.5">
                      {describeDays(s.pattern)} &middot; Desk# {s.deskNumber ?? '—'}
                    </p>
                    <div className="text-ink-muted text-sm">
                      {describeHours(s.pattern).map((line) => <p key={line}>{line}</p>)}
                    </div>

                    <p className="text-sm mt-1">
                      {s.activeUntil ? (
                        <>
                          {shortDay(s.activeFrom)} &ndash; {shortDay(s.activeUntil)}
                          <span className="text-ink-muted">
                            {' · '}
                            {over
                              ? `${s.bookings} booking${s.bookings === 1 ? '' : 's'}`
                              : `${s.bookingsRemaining} of ${s.bookings} left`}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-ink-muted">Since {shortDay(s.activeFrom)} · </span>
                          <span className="text-amber-800">
                            bookings stop {shortDay(s.generatedThrough)}
                          </span>
                        </>
                      )}
                      {s.skipped > 0 && (
                        <span className="text-ink-muted">
                          {' · '}{s.skipped} day{s.skipped === 1 ? '' : 's'} skipped, desk taken
                        </span>
                      )}
                    </p>

                    {s.decidedBy && !over && (
                      <p className="text-ink-muted text-xs mt-1">Approved by {s.decidedBy}</p>
                    )}

                    {!over && s.bookingsRemaining > 0 && (
                      <button
                        onClick={() => setExpandedDays(expandedDays === s.id ? null : s.id)}
                        className="text-mqd-700 text-xs font-semibold mt-1.5 hover:underline"
                      >
                        {expandedDays === s.id
                          ? 'Hide days'
                          : `Show the ${s.bookingsRemaining} day${s.bookingsRemaining === 1 ? '' : 's'} still to come`}
                      </button>
                    )}
                  </div>

                  {/* Only a live arrangement can be ended. One that has run its
                      course is history, and cancelling it would rewrite that. */}
                  {!over && (
                    confirmingId === s.id ? (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="text-red-700 text-xs max-w-[13rem] text-right">
                          Releases {s.bookingsRemaining} upcoming booking
                          {s.bookingsRemaining === 1 ? '' : 's'}. Past ones are kept.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEnd(s)}
                            disabled={busyId === s.id}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
                          >
                            {busyId === s.id ? 'Ending…' : 'End it'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            disabled={busyId === s.id}
                            className="border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-xs font-semibold px-3 py-1.5 rounded transition"
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Editing is reversible and recorded; ending is not, so only
                      // one of them asks twice.
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setEditing(s)}
                          className="border border-surface-line text-ink-body hover:bg-surface-panel text-xs font-semibold px-3 py-1.5 rounded transition flex items-center gap-1.5"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmingId(s.id)}
                          className="border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded transition"
                        >
                          End
                        </button>
                      </div>
                    )
                  )}
                </div>

                {expandedDays === s.id && (
                  <ScheduleDays
                    seriesId={s.id}
                    deskNumber={s.deskNumber}
                    onChanged={async () => { await load(); onChanged?.(); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <p className="text-ink-muted text-xs mt-4">
        Showing {shown.length} of {decided.length} decided schedule{decided.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
