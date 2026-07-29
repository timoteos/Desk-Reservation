import { useState, useEffect, useCallback } from 'react';
import { CalendarX, Search } from 'lucide-react';
import { getAllReservations, adminCancelReservation } from '../api/client';

const SCOPES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-600',
  canceled: 'bg-gray-200 text-gray-600',
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

// Only a live booking can be overridden; a past or already-decided one can't.
const isCancelable = (r) => ['pending', 'approved'].includes(r.status);

export default function ReservationsTab() {
  const [scope, setScope] = useState('upcoming');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getAllReservations(scope)
      .then(setReservations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id) => {
    setBusyId(id);
    try {
      await adminCancelReservation(id);
      await load();
      setConfirmingId(null);
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusyId(null);
    }
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
    <div className="bg-gray-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 tracking-wide">RESERVATIONS</h1>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden bg-white">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-4 py-1.5 text-sm font-semibold transition
                ${scope === s.key ? 'bg-mqd-btn text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name, desk or code"
          className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-mqd-btn"
        />
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-10">Loading reservations…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CalendarX className="w-9 h-9 text-gray-400" />
          <p className="text-gray-600 text-sm">
            {term ? 'Nothing matches that search.' : `No ${scope === 'all' ? '' : scope} reservations.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {shown.map((r) => (
            <div key={r.id} className="bg-white rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800">{r.user}</p>
                    <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mt-0.5">
                    {formatDate(r.date)} &middot; Desk# {r.deskNumber} &middot;{' '}
                    {formatMinutes(r.startMin)} - {formatMinutes(r.endMin)}
                  </p>
                  <p className="font-mono text-xs text-gray-400 mt-1 select-all">{r.confirmationCode}</p>
                </div>

                {isCancelable(r) && (
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
                        className="border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded transition"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(r.id)}
                      className="shrink-0 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded transition"
                    >
                      Cancel
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-gray-500 text-xs mt-4">
        Showing {shown.length} of {reservations.length}
        {scope === 'all' ? '' : ` ${scope}`} reservation{reservations.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
