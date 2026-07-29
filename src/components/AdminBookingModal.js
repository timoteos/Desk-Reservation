import { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { adminBook } from '../api/client';
import {
  OFFICE_START,
  OFFICE_END,
  SLOT_MINUTES,
  OFFICE_HOURS_LABEL,
  timeOptions,
} from '../lib/officeHours';

const todayValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Lets an admin book without leaving the dashboard — for themselves, or on
// someone's behalf when a visitor needs a desk arranged for them.
export default function AdminBookingModal({ users, onClose, onBooked }) {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayValue());
  const [start, setStart] = useState(OFFICE_START);
  const [end, setEnd] = useState(OFFICE_END);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Moving the start past the end drags the end along, so the two can never
  // describe an impossible window.
  const handleStartChange = (next) => {
    setStart(next);
    if (end <= next) setEnd(Math.min(next + SLOT_MINUTES, OFFICE_END));
  };

  const canSubmit = userId && date && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const booking = await adminBook({
        userId: Number(userId),
        date,
        startMin: start,
        endMin: end,
      });
      setResult(booking);
      onBooked?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const bookedFor = users.find((u) => u.id === userId)?.name;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-mqd-title text-xl font-bold mb-1">Book a desk</h2>
        <p className="text-gray-500 text-sm mb-5">
          {result
            ? 'Booked and approved.'
            : 'Booked directly — no approval needed, since you are the approver.'}
        </p>

        {result ? (
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <CheckCircle2 className="w-10 h-10 text-mqd-title" />
            <p className="text-gray-700 text-sm">
              Desk# {result.deskNumber}{bookedFor ? ` for ${bookedFor}` : ''}
            </p>
            <div className="bg-mqd-btn/10 border border-mqd-btn/20 rounded-lg px-6 py-4 w-full">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Confirmation code</p>
              <p className="text-mqd-title text-2xl font-bold tracking-[0.15em] font-mono">
                {result.confirmationCode}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold py-2.5 rounded-lg text-sm transition mt-2"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="book-user" className="text-gray-700 font-medium text-sm mb-1.5 block">
                Who is it for?
              </label>
              <select
                id="book-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              >
                <option value="">Select a person…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="book-date" className="text-gray-700 font-medium text-sm mb-1.5 block">
                Date
              </label>
              <input
                id="book-date"
                type="date"
                value={date}
                min={todayValue()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="book-start" className="text-gray-700 font-medium text-sm mb-1.5 block">
                  From
                </label>
                <select
                  id="book-start"
                  value={start}
                  onChange={(e) => handleStartChange(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ to: OFFICE_END - SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="book-end" className="text-gray-700 font-medium text-sm mb-1.5 block">
                  To
                </label>
                <select
                  id="book-end"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ from: start + SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-gray-400 text-xs">
              Office hours are {OFFICE_HOURS_LABEL}, in {SLOT_MINUTES}-minute blocks. A free desk is assigned automatically.
            </p>

            {error && (
              <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition"
            >
              {submitting ? 'Booking…' : 'Book desk'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
