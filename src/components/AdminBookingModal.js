import { useState, useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import DeskMap, { DeskMapLegend, deskStatuses } from './DeskMap';
import { adminBook, getDesks, getReservationsForDate } from '../api/client';
import {
  OFFICE_END,
  SLOT_MINUTES,
  OFFICE_HOURS_LABEL,
  formatMinutes,
  timeOptions,
  isWorkingDay,
  earliestStartOn,
} from '../lib/officeHours';

const todayValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Lets an admin book without leaving the dashboard — for themselves, or on
// someone's behalf when a visitor needs a desk arranged for them.
//
// Laid out like the edit dialog, and for the same reason: which desks are free
// depends on the window, so the map has to sit with the times rather than on a
// separate step. Choosing a desk is optional — leaving it unpicked assigns a
// free one, which is what an admin booking for themselves usually wants.
export default function AdminBookingModal({ users, onClose, onBooked }) {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayValue());
  // Opening on the whole office day meant that from 7:30 AM onwards the default
  // state could never be booked — a full map of apparently free desks, and a
  // refusal on the first click. Start from what is actually still available.
  const [start, setStart] = useState(() =>
    Math.min(earliestStartOn(todayValue()), OFFICE_END - SLOT_MINUTES));
  const [end, setEnd] = useState(() =>
    Math.min(
      Math.min(earliestStartOn(todayValue()), OFFICE_END - SLOT_MINUTES) + 60,
      OFFICE_END
    ));
  const [deskId, setDeskId] = useState(null);

  const [desks, setDesks] = useState([]);
  const [loadingDesks, setLoadingDesks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Moving the start past the end drags the end along, so the two can never
  // describe an impossible window.
  const handleStartChange = (next) => {
    setStart(next);
    if (end <= next) setEnd(Math.min(next + SLOT_MINUTES, OFFICE_END));
  };

  // Availability is a property of the window, so it is refetched whenever the
  // window moves — the same coupling the edit dialog relies on.
  useEffect(() => {
    if (result) return undefined;
    if (!isWorkingDay(date) || start < earliestStartOn(date)) {
      setDesks([]);
      setDeskId(null);
      setLoadingDesks(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingDesks(true);

    Promise.all([getDesks(), getReservationsForDate(date)])
      .then(([deskList, reservations]) => {
        if (cancelled) return;
        const withStatus = deskStatuses(deskList, reservations, start, end);
        setDesks(withStatus);
        // A desk chosen at one time may be taken at another. Drop the choice
        // rather than submitting something the server will refuse.
        setDeskId((current) => {
          if (current == null) return null;
          const still = withStatus.find((d) => String(d.id) === String(current));
          return still && still.status !== 'booked' ? current : null;
        });
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingDesks(false); });

    return () => { cancelled = true; };
  }, [date, start, end, result]);

  // A date input cannot grey out weekends the way the calendar can, so the rule
  // is stated instead of enforced by the control.
  const closedDay = !isWorkingDay(date);
  const earliest = earliestStartOn(date);
  const dayOver = earliest > OFFICE_END - SLOT_MINUTES;
  const windowPassed = !closedDay && start < earliest;
  const canSubmit = userId && date && !closedDay && !windowPassed && !submitting;
  const selectedDesk = desks.find((d) => String(d.id) === String(deskId));

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
        // Omitted rather than null, so the server assigns one.
        ...(deskId != null ? { deskId: Number(deskId) } : {}),
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
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-modal w-full p-6 relative ${result ? 'max-w-md' : 'max-w-2xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-muted hover:text-ink-body transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-mqd-title text-xl font-bold mb-1">Book a desk</h2>
        <p className="text-ink-muted text-sm mb-5">
          {result
            ? 'Booked and approved.'
            : 'Booked directly — no approval needed, since you are the approver.'}
        </p>

        {result ? (
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <CheckCircle2 className="w-10 h-10 text-mqd-title" />
            <p className="text-ink-body text-sm">
              Desk# {result.deskNumber}{bookedFor ? ` for ${bookedFor}` : ''}
            </p>
            <div className="bg-mqd-btn/10 border border-mqd-btn/20 rounded-lg px-6 py-4 w-full">
              <p className="text-ink-muted text-xs uppercase tracking-wide mb-1">Confirmation code</p>
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
              <label htmlFor="book-user" className="text-ink-body font-medium text-sm mb-1.5 block">
                Who is it for?
              </label>
              <select
                id="book-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full border border-surface-line rounded-lg px-3 py-2.5 text-ink-body text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              >
                <option value="">Select a person…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="book-date" className="text-ink-body font-medium text-sm mb-1.5 block">
                  Date
                </label>
                <input
                  id="book-date"
                  type="date"
                  value={date}
                  min={todayValue()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-surface-line rounded-lg px-3 py-2.5 text-ink-body text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </div>
              <div>
                <label htmlFor="book-start" className="text-ink-body font-medium text-sm mb-1.5 block">
                  From
                </label>
                <select
                  id="book-start"
                  value={start}
                  onChange={(e) => handleStartChange(Number(e.target.value))}
                  className="w-full border border-surface-line rounded-lg px-3 py-2.5 text-ink-body text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ to: OFFICE_END - SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value} disabled={o.value < earliest}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="book-end" className="text-ink-body font-medium text-sm mb-1.5 block">
                  To
                </label>
                <select
                  id="book-end"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className="w-full border border-surface-line rounded-lg px-3 py-2.5 text-ink-body text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ from: start + SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-ink-muted text-xs -mt-1">
              Office hours are {OFFICE_HOURS_LABEL}, Monday to Friday, in {SLOT_MINUTES}-minute blocks.
            </p>

            {closedDay && (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                The office is closed that day. Pick a weekday.
              </p>
            )}

            {!closedDay && windowPassed && (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                {dayOver
                  ? 'The office day has finished. Pick another date.'
                  : `That time has already passed. The next bookable slot today is ${formatMinutes(earliest)}.`}
              </p>
            )}

            <div>
              <p className="text-ink-body font-medium text-sm mb-2">
                Pick a desk for {formatMinutes(start)} – {formatMinutes(end)}
                <span className="text-ink-muted font-normal"> — optional</span>
              </p>
              <DeskMap
                desks={desks}
                selectedDeskId={deskId}
                // Clicking the chosen desk again clears it, so going back to
                // "any free desk" doesn't mean closing the dialog and starting over.
                onSelect={(desk) =>
                  setDeskId((current) => (String(current) === String(desk.id) ? null : desk.id))
                }
                loading={loadingDesks}
                compact
              />
              <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                <DeskMapLegend />
                <p className="text-sm text-ink-body">
                  {selectedDesk ? `Selected: Desk# ${selectedDesk.number}` : 'Any free desk'}
                </p>
              </div>
            </div>

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
              {submitting
                ? 'Booking…'
                : selectedDesk
                  ? `Book Desk# ${selectedDesk.number}`
                  : 'Book any free desk'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
