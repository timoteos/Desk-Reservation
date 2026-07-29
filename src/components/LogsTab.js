import { useState, useEffect, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { getLogs, getActivityTypes } from '../api/client';

// Colour carries the kind of event so the trail can be skimmed: things that
// grant a desk read green, things that take one away read red or grey.
const ACTIVITY_STYLES = {
  created: 'bg-blue-100 text-blue-800',
  booked_by_admin: 'bg-blue-100 text-blue-800',
  schedule_requested: 'bg-indigo-100 text-indigo-800',
  approved: 'bg-emerald-100 text-emerald-800',
  denied: 'bg-red-100 text-red-800',
  canceled: 'bg-surface-panel text-ink-body',
  overridden: 'bg-amber-100 text-amber-800',
  expired: 'bg-surface-panel text-ink-body',
};

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const formatWhen = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

const formatDate = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

// A holder cancelling by confirmation code isn't signed in, so their actor is
// null — the same as a system action. The activity type is what separates
// them, so name the person rather than reporting "System".
const actorLabel = (log) => {
  if (log.actor) return log.actor;
  if (log.activity === 'canceled') return log.subject || 'The holder';
  return 'System';
};

export default function LogsTab({ dataVersion = 0 }) {
  const [logs, setLogs] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getActivityTypes().then(setActivityTypes).catch(() => setActivityTypes([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getLogs(filter)
      .then(setLogs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  // dataVersion is a reason to refetch, not an input to load, so it belongs on
  // the effect rather than in the callback's dependencies.
  useEffect(() => { load(); }, [load, dataVersion]);

  return (
    <div className="bg-surface-panel border border-surface-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink ">Activity log</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-white border border-surface-line rounded-lg px-3 py-1.5 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
        >
          <option value="">All activity</option>
          {activityTypes.map((a) => (
            <option key={a.type} value={a.type}>{a.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-ink-muted text-sm text-center py-10">Loading activity…</p>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <ScrollText className="w-9 h-9 text-ink-muted" />
          <p className="text-ink-body text-sm">
            {filter ? 'No activity of that kind yet.' : 'No activity recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${ACTIVITY_STYLES[log.activity] || 'bg-surface-panel text-ink-body'}`}>
                      {log.label}
                    </span>
                    <span className="text-sm font-semibold text-ink">{actorLabel(log)}</span>
                  </div>

                  {log.subject && (
                    <p className="text-ink-muted text-sm mt-1">
                      {/* Naming the subject only when it differs from the actor
                          avoids "Steve Elias — Steve Elias" on self-service. */}
                      {actorLabel(log) !== log.subject && <>{log.subject} &middot; </>}
                      {log.date && formatDate(log.date)}
                      {log.deskNumber != null && <> &middot; Desk# {log.deskNumber}</>}
                      {log.startMin != null && <> &middot; {formatMinutes(log.startMin)} - {formatMinutes(log.endMin)}</>}
                    </p>
                  )}

                  {log.description && (
                    <p className="text-ink-muted text-xs mt-1">{log.description}</p>
                  )}
                </div>

                <span className="text-xs text-ink-muted whitespace-nowrap shrink-0">
                  {formatWhen(log.occurredAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-ink-muted text-xs mt-4">
        Showing the {logs.length} most recent {filter ? 'matching ' : ''}event{logs.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
