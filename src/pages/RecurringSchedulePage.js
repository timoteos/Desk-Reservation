import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, CheckCircle2, Mail } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { createRecurringSchedule, getRecurringAvailability } from '../api/client';
import DeskMap from '../components/DeskMap';
import {
  OFFICE_START as OFFICE_START_MIN,
  OFFICE_END as OFFICE_END_MIN,
  OFFICE_HOURS_LABEL,
  SLOT_MINUTES,
  toTimeValue,
  timeOptions,
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

const formatDay = (dateStr) =>
  dateStr
    ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';

// "08:30" -> 510
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const todayValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const OFFICE_START = toTimeValue(OFFICE_START_MIN);
const OFFICE_END = toTimeValue(OFFICE_END_MIN);

export default function RecurringSchedulePage() {
  const navigate = useNavigate();
  // Map of dayKey -> { start, end } for every day the user has selected
  const [schedule, setSchedule] = useState({});
  const [email, setEmail] = useState('');
  // A contract or project has an end. Without one the pattern runs to a rolling
  // 90-day limit, which held a desk long past the point anyone would use it.
  const [activeFrom, setActiveFrom] = useState(todayValue());
  const [activeUntil, setActiveUntil] = useState('');
  const [deskId, setDeskId] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loadingDesks, setLoadingDesks] = useState(false);
  // Why the preview failed. Discarding it left the desk section showing a
  // loading message indefinitely, with nothing to say the request had failed
  // rather than being slow — and the reason only arriving after submitting.
  const [availabilityError, setAvailabilityError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Availability for a pattern is not a yes or a no — a desk taken on three of
  // sixty-five days is neither free nor unusable — so it is refetched whenever
  // the pattern changes and reported per desk as a count.
  useEffect(() => {
    const keys = Object.keys(schedule);
    if (result || keys.length === 0) { setAvailability(null); return undefined; }

    let cancelled = false;
    setLoadingDesks(true);
    setAvailabilityError(null);

    const days = {};
    keys.forEach((key) => {
      days[key] = {
        startMin: toMinutes(schedule[key].start),
        endMin: toMinutes(schedule[key].end),
      };
    });

    getRecurringAvailability({ days, activeFrom, ...(activeUntil ? { activeUntil } : {}) })
      .then((data) => {
        if (cancelled) return;
        setAvailability(data);
        // A desk that fitted the previous pattern may not fit this one, so the
        // choice is dropped the moment it stops covering every day.
        setDeskId((current) => {
          if (current == null) return null;
          const still = data.desks.find((d) => d.deskId === current);
          return still && still.conflicts === 0 ? current : null;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailability(null);
        setAvailabilityError(err.message);
      })
      .finally(() => { if (!cancelled) setLoadingDesks(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(schedule), activeFrom, activeUntil, result]);

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

  // Moving a start past its end drags the end along, so a day can never
  // describe an impossible window — the same behaviour as every other time
  // control in the app.
  const updateDayTime = (key, field, value) => {
    setSchedule((prev) => {
      const day = { ...prev[key], [field]: value };
      if (field === 'start' && toMinutes(day.end) <= toMinutes(value)) {
        day.end = toTimeValue(Math.min(toMinutes(value) + SLOT_MINUTES, OFFICE_END_MIN));
      }
      return { ...prev, [key]: day };
    });
  };

  const selectedKeys = Object.keys(schedule);
  const allValid = selectedKeys.every((key) => schedule[key].start < schedule[key].end);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // No point submitting a pattern the server has already refused to price.
  const canSubmit =
    selectedKeys.length > 0 && allValid && isValidEmail && !submitting && !availabilityError;

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
      setResult(await createRecurringSchedule({
        email: email.trim(),
        days,
        activeFrom,
        // Omitted rather than empty, so the server records that no end was
        // chosen instead of treating the fallback as a decision.
        ...(activeUntil ? { activeUntil } : {}),
        ...(deskId != null ? { deskId } : {}),
      }));
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
                {result.created === 1 ? '' : 's'} through {formatDay(result.generatedThrough)},
                pending approval
              </p>
              {result.openEnded && (
                <p className="text-ink-muted text-xs max-w-sm">
                  No end date was set, so bookings run to {formatDay(result.generatedThrough)}
                  {' '}and stop there. Ask an administrator to extend them if you need longer.
                </p>
              )}
              {result.cappedAtCeiling && (
                <p className="text-ink-muted text-xs max-w-sm">
                  That end date was further out than a schedule can reach, so bookings run
                  to {formatDay(result.generatedThrough)}.
                </p>
              )}
              <div className="text-ink-muted text-sm w-full space-y-1 mt-2">
                {selectedDays.map((d) => (
                  <p key={d.key}>
                    <span className="font-medium text-ink-body">{d.label}:</span>{' '}
                    {schedule[d.key].start} - {schedule[d.key].end}
                  </p>
                ))}
              </div>

              {/* One code for the whole arrangement, not one per generated day.
                  It is what they look the schedule up with, release a single day
                  with, and — once check-in exists — check in with. */}
              {result.confirmationCode && (
                <div className="bg-surface-page border border-surface-line rounded-lg px-4 py-3 mt-3 w-full">
                  <p className="text-ink-body text-sm">
                    <span className="font-semibold text-mqd-title">Confirmation code:</span>{' '}
                    <span className="font-mono tracking-wider">{result.confirmationCode}</span>
                  </p>
                  <p className="text-ink-muted text-xs mt-1">
                    One code for the whole schedule — the same one every day you come in.
                    Keep it to check or change your days.
                  </p>
                </div>
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
              {/* How long the pattern runs for */}
              <div>
                <p className="text-ink-body font-medium mb-2">How long do you need it?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">First week starting</span>
                    <input
                      type="date"
                      value={activeFrom}
                      min={todayValue()}
                      onChange={(e) => setActiveFrom(e.target.value)}
                      className="w-full border border-surface-line rounded-lg px-3 py-2 text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">
                      Last day <span className="text-ink-muted">(optional)</span>
                    </span>
                    <input
                      type="date"
                      value={activeUntil}
                      min={activeFrom || todayValue()}
                      onChange={(e) => setActiveUntil(e.target.value)}
                      className="w-full border border-surface-line rounded-lg px-3 py-2 text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                    />
                  </label>
                </div>
                <p className="text-ink-muted text-xs mt-2">
                  {activeUntil
                    ? 'Bookings are made up to that day and no further.'
                    : 'Without an end date, bookings are made for the next 90 days only. If your time here has an end — a contract or a project — setting it frees the desk for everyone else afterwards.'}
                </p>
              </div>

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
                    return (
                      <div key={day.key} className="border border-surface-line rounded-lg p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <span className="text-ink-body font-medium text-sm sm:w-24 shrink-0">{day.label}</span>
                          <div className="flex items-center gap-2 flex-1">
                            {/* Selects, as everywhere else. min and max on a time
                                input constrain the range but not the step, so
                                9:07 passed native validation and only the server
                                refused it. An option never offered cannot be
                                chosen, and the end list starts after the start so
                                an impossible window is unreachable. */}
                            <select
                              value={start}
                              onChange={(e) => updateDayTime(day.key, 'start', e.target.value)}
                              className="flex-1 min-w-0 border border-surface-line rounded-lg px-3 py-2 text-ink-body text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            >
                              {timeOptions({ to: OFFICE_END_MIN - SLOT_MINUTES }).map((o) => (
                                <option key={o.value} value={toTimeValue(o.value)}>{o.label}</option>
                              ))}
                            </select>
                            <span className="text-ink-muted text-sm shrink-0">to</span>
                            <select
                              value={end}
                              onChange={(e) => updateDayTime(day.key, 'end', e.target.value)}
                              className="flex-1 min-w-0 border border-surface-line rounded-lg px-3 py-2 text-ink-body text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            >
                              {timeOptions({ from: toMinutes(start) + SLOT_MINUTES }).map((o) => (
                                <option key={o.value} value={toTimeValue(o.value)}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
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

              {/* Desk choice. Optional, because someone in for a week may not
                  care — but the point of a recurring booking is a fixed
                  arrangement, so whoever is here every day usually does. */}
              {selectedKeys.length > 0 && (
                <div>
                  <p className="text-ink-body font-medium mb-1">
                    Pick a desk <span className="text-ink-muted font-normal">— optional</span>
                  </p>
                  {availabilityError ? (
                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-2">
                      {availabilityError}
                    </p>
                  ) : (
                    <p className="text-ink-muted text-xs mb-2">
                      {availability
                        ? `${availability.occurrences} booking${availability.occurrences === 1 ? '' : 's'} in this pattern. A desk has to be free for every one of them — it is yours for the whole run.`
                        : loadingDesks
                          ? 'Working out what each desk can offer…'
                          : 'Pick your days and times to see which desks are free.'}
                    </p>
                  )}

                  <DeskMap
                    desks={(availability?.desks ?? []).map((d) => ({
                      id: d.deskId,
                      number: d.deskNumber,
                      label: `Desk# ${d.deskNumber}`,
                      // Partial is shown but not offered. A schedule covers every
                      // day or none — the desk is the holder's for the duration,
                      // which cannot be true if someone else has it on the third
                      // Wednesday. Amber still earns its place by distinguishing
                      // "two days short" from "taken throughout": the first is
                      // worth shifting your dates for.
                      status:
                        d.conflicts === 0 ? 'available'
                          : d.bookable === 0 ? 'booked'
                            : 'partial',
                      conflicts: d.conflicts,
                      occurrences: d.occurrences,
                    }))}
                    selectedDeskId={deskId}
                    onSelect={(desk) =>
                      setDeskId((current) => (current === desk.id ? null : desk.id))
                    }
                    loading={loadingDesks}
                    compact
                  />

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-body mt-2">
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-3 rounded bg-emerald-500" /> Free every day
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-3 rounded bg-amber-400" /> Some days taken — can't be used
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-3 rounded bg-rose-500" /> Taken every day
                    </span>
                  </div>

                  <p className="text-ink-body text-sm mt-2">
                    {(() => {
                      const chosen = availability?.desks.find((d) => d.deskId === deskId);
                      if (!chosen) {
                        const clear = availability?.desks.filter((d) => d.conflicts === 0).length;
                        if (availability && clear === 0) {
                          return 'No desk is free for every day. Try different days or dates.';
                        }
                        return 'No desk chosen — one that fits the whole pattern will be assigned.';
                      }
                      return `Desk# ${chosen.deskNumber} — free for all ${chosen.occurrences} days.`;
                    })()}
                  </p>
                </div>
              )}

              <p className="text-ink-muted text-xs -mt-2">
                Office hours are {OFFICE_HOURS_LABEL}, Monday through Friday. Without a
                choice, the desk that fits the most days is assigned.
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
