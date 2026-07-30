import { useState, useEffect, useCallback } from 'react';
import { getScheduleDays, adminCancelReservation } from '../api/client';

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const dayLabel = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

// The days a schedule still has coming, and a way to free one of them.
//
// Somebody being away next Tuesday should not mean ending their arrangement or
// editing its pattern — the pattern is right, one day of it is not wanted. This
// used to be reachable by expanding the schedule in the Reservations tab, which
// put schedule management in a tab meant for one-off bookings. The capability
// belongs with the schedule; only its location has changed.
//
// Loaded when opened rather than with the list, since this is a dozen days per
// schedule and most rows are never opened.
export default function ScheduleDays({ seriesId, deskNumber, onChanged }) {
  const [days, setDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // keepError, because a failed release re-reads the list to show what the server
  // actually has — and a successful re-read would otherwise clear the message
  // explaining why the release failed, leaving the button looking like it did
  // nothing at all.
  const load = useCallback(({ keepError = false } = {}) => {
    setLoading(true);
    return getScheduleDays(seriesId)
      .then((data) => { setDays(data); if (!keepError) setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const release = async (day) => {
    setBusyId(day.id);
    setError(null);
    try {
      await adminCancelReservation(day.id);
      setConfirmingId(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
      await load({ keepError: true });
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !days) {
    return <p className="text-ink-muted text-sm py-2">Loading days…</p>;
  }

  return (
    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-surface-line">
      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {days && days.length === 0 ? (
        <p className="text-ink-muted text-sm">No days still to come.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
          {(days ?? []).map((day) => (
            <div
              key={day.id}
              className="flex items-center justify-between gap-3 bg-surface-page border border-surface-line rounded px-3 py-1.5"
            >
              <div className="min-w-0">
                <span className="text-ink-body text-sm">{dayLabel(day.date)}</span>
                <span className="text-ink-muted text-sm">
                  {' · '}{formatMinutes(day.startMin)} – {formatMinutes(day.endMin)}
                  {' · '}Desk# {day.deskNumber ?? deskNumber ?? '—'}
                </span>
              </div>

              {confirmingId === day.id ? (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => release(day)}
                    disabled={busyId === day.id}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold px-2.5 py-1 rounded transition"
                  >
                    {busyId === day.id ? 'Releasing…' : 'Release'}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    disabled={busyId === day.id}
                    className="border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-xs font-semibold px-2.5 py-1 rounded transition"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setConfirmingId(day.id); setError(null); }}
                  className="shrink-0 text-ink-muted hover:text-red-700 text-xs font-semibold transition"
                >
                  Release this day
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-ink-muted text-xs">
        Releasing one day frees the desk for somebody else that day. The schedule keeps running.
      </p>
    </div>
  );
}
