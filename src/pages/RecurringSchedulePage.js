import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, CheckCircle2, Mail } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { createRecurringSchedule } from '../api/client';
import {
  OFFICE_START as OFFICE_START_MIN,
  OFFICE_END as OFFICE_END_MIN,
  OFFICE_HOURS_LABEL,
  toTimeValue,
} from '../lib/officeHours';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  { label: 'Recurring Schedule', path: '/recurring-schedule' },
];

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
];

const OFFICE_START = toTimeValue(OFFICE_START_MIN);
const OFFICE_END = toTimeValue(OFFICE_END_MIN);

export default function RecurringSchedulePage() {
  const navigate = useNavigate();
  // Map of dayKey -> { start, end } for every day the user has selected
  const [schedule, setSchedule] = useState({});
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggleDay = (key) => {
    setSchedule((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { start: OFFICE_START, end: OFFICE_END };
      }
      return next;
    });
  };

  const updateDayTime = (key, field, value) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const selectedKeys = Object.keys(schedule);
  const allValid = selectedKeys.every((key) => schedule[key].start < schedule[key].end);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = selectedKeys.length > 0 && allValid && isValidEmail && !submitting;

  // "08:30" -> 510
  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const days = Object.fromEntries(
        selectedKeys.map((key) => [
          key,
          { startMin: toMinutes(schedule[key].start), endMin: toMinutes(schedule[key].end) },
        ])
      );
      setResult(await createRecurringSchedule({ email: email.trim(), days }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDays = DAYS.filter((d) => schedule[d.key]);

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-surface-page">
        <div className="w-full max-w-lg flex flex-col gap-6 bg-white rounded-xl border border-surface-line p-8 opacity-0 animate-fade-up">

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-mqd-title/10 flex items-center justify-center shrink-0">
              <RotateCcw className="w-6 h-6 text-mqd-title" />
            </div>
            <div>
              <h1 className="text-mqd-title text-2xl font-bold">Recurring Schedule</h1>
              <p className="text-ink-muted text-sm mt-0.5">
                Pick your days and set a different time for each one — great for half days.
              </p>
            </div>
          </div>

          {result ? (
            <div className="flex flex-col items-center gap-2 text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-mqd-title" />
              <p className="text-mqd-title font-semibold">Request submitted</p>
              <p className="text-ink-body text-sm">
                Desk# {result.deskNumber} &middot; {result.created} booking
                {result.created === 1 ? '' : 's'} over the next {result.horizonDays} days,
                pending approval
              </p>
              <div className="text-ink-muted text-sm w-full space-y-1 mt-2">
                {selectedDays.map((d) => (
                  <p key={d.key}>
                    <span className="font-medium text-ink-body">{d.label}:</span>{' '}
                    {schedule[d.key].start} - {schedule[d.key].end}
                  </p>
                ))}
              </div>

              {result.skipped.length > 0 && (
                <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mt-2 w-full">
                  {result.skipped.length} date{result.skipped.length === 1 ? ' was' : 's were'} skipped
                  because that desk was already booked at the time.
                </p>
              )}
              <button
                onClick={() => navigate('/reservation')}
                className="mt-4 text-mqd-btn hover:underline text-sm font-medium"
              >
                ← Back to Reservation
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Day selection */}
              <div>
                <p className="text-ink-body font-medium mb-2">Days of the week</p>
                <div className="grid grid-cols-5 gap-2">
                  {DAYS.map((day) => {
                    const isSelected = !!schedule[day.key];
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        className={`py-3 rounded-lg text-xs sm:text-sm font-semibold border transition
                          ${isSelected
                            ? 'bg-mqd-btn text-white border-mqd-btn'
                            : 'bg-white text-ink-body border-surface-line hover:bg-surface-panel'}`}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-day time ranges */}
              {selectedDays.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-ink-body font-medium -mb-1">Time per day</p>
                  {selectedDays.map((day) => {
                    const { start, end } = schedule[day.key];
                    const isValid = start < end;
                    return (
                      <div key={day.key} className="border border-surface-line rounded-lg p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <span className="text-ink-body font-medium text-sm sm:w-24 shrink-0">{day.label}</span>
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              value={start}
                              min={OFFICE_START}
                              max={OFFICE_END}
                              onChange={(e) => updateDayTime(day.key, 'start', e.target.value)}
                              className="flex-1 min-w-0 border border-surface-line rounded-lg px-3 py-2 text-ink-body text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            />
                            <span className="text-ink-muted text-sm shrink-0">to</span>
                            <input
                              type="time"
                              value={end}
                              min={OFFICE_START}
                              max={OFFICE_END}
                              onChange={(e) => updateDayTime(day.key, 'end', e.target.value)}
                              className="flex-1 min-w-0 border border-surface-line rounded-lg px-3 py-2 text-ink-body text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            />
                          </div>
                        </div>
                        {!isValid && (
                          <p className="text-red-500 text-xs mt-2">End time must be after start time.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label htmlFor="recurring-email" className="text-ink-body font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </label>
                <input
                  id="recurring-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dhs.hawaii.gov"
                  required
                  className="w-full border border-surface-line rounded-lg px-4 py-3 text-ink-body text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </div>

              <p className="text-ink-muted text-xs -mt-2">
                Office hours are {OFFICE_HOURS_LABEL}, Monday through Friday. A desk is
                assigned automatically and booked for the next 90 days.
              </p>

              {error && (
                <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-lg text-base transition"
              >
                {submitting ? 'Creating bookings…' : 'Set Up Recurring Schedule'}
              </button>
            </form>
          )}

        </div>
      </div>
    </>
  );
}
