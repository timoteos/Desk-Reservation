import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import DeskMap, { DeskMapLegend, deskStatuses } from './DeskMap';
import { getDesks, getReservationsForDate, adminEditReservation } from '../api/client';

const DAY_START = 480; // 8:00 AM
const DAY_END = 990;   // 4:30 PM

const toTimeValue = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const toMinutes = (value) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(mins % 60).padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

// Editing one booking, where the desk and the time are chosen together.
//
// They are not independent: moving a booking to the afternoon changes which
// desks are free, so the map always reflects the window currently in the form
// rather than the window the booking started with.
export default function EditReservationModal({ reservation, onClose, onSaved }) {
  const [date, setDate] = useState(reservation.date);
  const [startMin, setStartMin] = useState(reservation.startMin);
  const [endMin, setEndMin] = useState(reservation.endMin);
  const [deskId, setDeskId] = useState(reservation.deskId);

  const [desks, setDesks] = useState([]);
  const [loadingDesks, setLoadingDesks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const validWindow = endMin > startMin;

  // Refetches whenever the window moves, because that is exactly when the
  // answer changes. The booking being edited is excluded from the conflict
  // check so it doesn't report its own desk as taken.
  useEffect(() => {
    let cancelled = false;
    setLoadingDesks(true);

    Promise.all([getDesks(), getReservationsForDate(date)])
      .then(([deskList, reservations]) => {
        if (cancelled) return;
        setDesks(
          deskStatuses(deskList, reservations, startMin, endMin, {
            // Always the desk the booking started on, so once the admin picks
            // somewhere else the original still reads as "where they are now".
            currentDeskId: reservation.deskId,
            ignoreReservationId: reservation.id,
          })
        );
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingDesks(false); });

    return () => { cancelled = true; };
    // Not deskId — picking a desk doesn't change who else is booked.
  }, [date, startMin, endMin, reservation.id, reservation.deskId]);

  const deskChanged = String(deskId) !== String(reservation.deskId);
  const timeChanged =
    date !== reservation.date ||
    startMin !== reservation.startMin ||
    endMin !== reservation.endMin;
  const dirty = deskChanged || timeChanged;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const changes = {};
      if (deskChanged) changes.deskId = deskId;
      if (timeChanged) Object.assign(changes, { date, startMin, endMin });
      const result = await adminEditReservation(reservation.id, changes);
      onSaved?.(result, { deskChanged, timeChanged });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedDesk = desks.find((d) => String(d.id) === String(deskId));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="text-xl font-bold text-mqd-title">Edit reservation</h2>
            <p className="text-gray-500 text-sm mt-0.5">{reservation.user}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* What it is now, so it's clear what's being changed from. */}
        <p className="text-gray-600 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
          Currently {formatDate(reservation.date)} &middot; Desk# {reservation.deskNumber} &middot;{' '}
          {formatMinutes(reservation.startMin)} – {formatMinutes(reservation.endMin)}
        </p>

        {reservation.bookingSource === 'recurring' && (
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-4">
            This occurrence only. Other dates in the recurring schedule stay as they are.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <label className="text-sm">
            <span className="block text-gray-700 font-medium mb-1">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 font-medium mb-1">From</span>
            <input
              type="time"
              value={toTimeValue(startMin)}
              min={toTimeValue(DAY_START)}
              max={toTimeValue(DAY_END)}
              onChange={(e) => setStartMin(toMinutes(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 font-medium mb-1">To</span>
            <input
              type="time"
              value={toTimeValue(endMin)}
              min={toTimeValue(DAY_START)}
              max={toTimeValue(DAY_END)}
              onChange={(e) => setEndMin(toMinutes(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          </label>
        </div>

        {!validWindow && (
          <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-3">
            End time must be after start time.
          </p>
        )}

        <p className="text-gray-700 text-sm font-medium mb-2">
          Pick a desk{validWindow ? ` for ${formatMinutes(startMin)} – ${formatMinutes(endMin)}` : ''}
        </p>

        <DeskMap
          desks={validWindow ? desks : []}
          selectedDeskId={deskId}
          onSelect={(desk) => setDeskId(desk.id)}
          loading={loadingDesks && validWindow}
          compact
        />

        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <DeskMapLegend showCurrent />
          <p className="text-sm text-gray-600">
            {selectedDesk ? `Selected: Desk# ${selectedDesk.number}` : 'No desk selected'}
          </p>
        </div>

        {error && (
          <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mt-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={!dirty || !validWindow || saving}
            className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 font-semibold rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
