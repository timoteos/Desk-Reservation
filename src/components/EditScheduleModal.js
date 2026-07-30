import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import DeskMap from './DeskMap';
import { getRecurringAvailability, adminEditSchedule } from '../api/client';
import {
  OFFICE_END,
  SLOT_MINUTES,
  toTimeValue,
  toMinutes,
  timeOptions,
} from '../lib/officeHours';

const DAYS = [
  { key: 'mon', label: 'Mon', number: 1 },
  { key: 'tue', label: 'Tue', number: 2 },
  { key: 'wed', label: 'Wed', number: 3 },
  { key: 'thu', label: 'Thu', number: 4 },
  { key: 'fri', label: 'Fri', number: 5 },
];

const DAY_BY_NUMBER = Object.fromEntries(DAYS.map((d) => [d.number, d.key]));

const todayValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const shortDay = (dateStr) =>
  dateStr
    ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

// Editing a live arrangement rather than requesting a new one.
//
// Days already served are not shown or touched — they happened, at the desk they
// happened at. Everything from today onward is what this changes, which is why
// the availability shown is for the remaining run and not the whole original.
export default function EditScheduleModal({ schedule, onClose, onSaved }) {
  const [days, setDays] = useState(() =>
    Object.fromEntries(
      schedule.pattern.map((p) => [
        DAY_BY_NUMBER[p.dayNumber],
        { start: toTimeValue(p.startMin), end: toTimeValue(p.endMin) },
      ])
    )
  );
  const [activeUntil, setActiveUntil] = useState(schedule.activeUntil ?? '');
  const [deskId, setDeskId] = useState(schedule.deskId ?? null);

  const [availability, setAvailability] = useState(null);
  const [loadingDesks, setLoadingDesks] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedKeys = Object.keys(days);

  // Availability for the remaining run, refetched whenever the pattern moves.
  //
  // ignoreSeriesId discounts this schedule's own upcoming bookings, which would
  // otherwise report its current desk as taken by itself. The save does the same,
  // so what the map shows is what the save will accept.
  useEffect(() => {
    const keys = Object.keys(days);
    if (keys.length === 0) { setAvailability(null); return undefined; }

    let cancelled = false;
    setLoadingDesks(true);
    setAvailabilityError(null);

    const payload = {};
    keys.forEach((k) => {
      payload[k] = { startMin: toMinutes(days[k].start), endMin: toMinutes(days[k].end) };
    });

    getRecurringAvailability({
      days: payload,
      ignoreSeriesId: schedule.id,
      ...(activeUntil ? { activeUntil } : {}),
    })
      .then((data) => { if (!cancelled) setAvailability(data); })
      .catch((err) => {
        if (cancelled) return;
        setAvailability(null);
        setAvailabilityError(err.message);
      })
      .finally(() => { if (!cancelled) setLoadingDesks(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(days), activeUntil, schedule.id]);

  const toggleDay = (key) =>
    setDays((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { start: toTimeValue(OFFICE_END - 120), end: toTimeValue(OFFICE_END) };
      return next;
    });

  const setDayTime = (key, field, value) =>
    setDays((prev) => {
      const day = { ...prev[key], [field]: value };
      if (field === 'start' && toMinutes(day.end) <= toMinutes(value)) {
        day.end = toTimeValue(Math.min(toMinutes(value) + SLOT_MINUTES, OFFICE_END));
      }
      return { ...prev, [key]: day };
    });

  // Partial is shown and refused, same as a new request: a schedule covers every
  // one of its days or it is not a schedule.
  const deskState = (d) => {
    if (d.conflicts === 0) return 'available';
    return d.bookable === 0 ? 'booked' : 'partial';
  };

  const chosen = availability?.desks.find((d) => String(d.deskId) === String(deskId));
  const chosenUsable = chosen ? deskState(chosen) === 'available' : false;

  const dirty =
    JSON.stringify(days) !== JSON.stringify(
      Object.fromEntries(
        schedule.pattern.map((p) => [
          DAY_BY_NUMBER[p.dayNumber],
          { start: toTimeValue(p.startMin), end: toTimeValue(p.endMin) },
        ])
      )
    ) ||
    (activeUntil || null) !== (schedule.activeUntil ?? null) ||
    String(deskId) !== String(schedule.deskId);

  const canSave =
    dirty && selectedKeys.length > 0 && !availabilityError && chosenUsable && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {};
      selectedKeys.forEach((k) => {
        payload[k] = { startMin: toMinutes(days[k].start), endMin: toMinutes(days[k].end) };
      });
      const result = await adminEditSchedule(schedule.id, {
        days: payload,
        deskId: Number(deskId),
        activeUntil: activeUntil || null,
      });
      onSaved?.(schedule, result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-modal w-full max-w-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-muted hover:text-ink-body transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-mqd-title">Edit schedule</h2>
        <p className="text-ink-muted text-sm mt-0.5 mb-4">{schedule.name}</p>

        <p className="text-ink-body text-sm bg-surface-page border border-surface-line rounded-lg px-3 py-2 mb-4">
          Days already worked keep the desk they were used at. This changes
          everything from today onward
          {schedule.bookingsRemaining > 0 && (
            <> &mdash; {schedule.bookingsRemaining} booking
              {schedule.bookingsRemaining === 1 ? '' : 's'} remaining</>
          )}.
        </p>

        <div className="mb-4">
          <p className="text-ink-body font-medium text-sm mb-2">Days</p>
          <div className="grid grid-cols-5 gap-2">
            {DAYS.map((d) => {
              const on = !!days[d.key];
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition
                    ${on
                      ? 'bg-mqd-btn text-white border-mqd-btn'
                      : 'bg-white text-ink-body border-surface-line hover:bg-surface-panel'}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedKeys.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {DAYS.filter((d) => days[d.key]).map((d) => (
              <div key={d.key} className="flex items-center gap-2 flex-wrap">
                <span className="text-ink-body text-sm w-10 shrink-0">{d.label}</span>
                <select
                  value={days[d.key].start}
                  onChange={(e) => setDayTime(d.key, 'start', e.target.value)}
                  className="border border-surface-line rounded-lg px-2 py-1.5 text-sm text-ink-body bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ to: OFFICE_END - SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={toTimeValue(o.value)}>{o.label}</option>
                  ))}
                </select>
                <span className="text-ink-muted text-sm">to</span>
                <select
                  value={days[d.key].end}
                  onChange={(e) => setDayTime(d.key, 'end', e.target.value)}
                  className="border border-surface-line rounded-lg px-2 py-1.5 text-sm text-ink-body bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ from: toMinutes(days[d.key].start) + SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={toTimeValue(o.value)}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <label className="text-sm block mb-4">
          <span className="block text-ink-body font-medium mb-1">
            Runs until <span className="text-ink-muted font-normal">(blank for open-ended)</span>
          </span>
          <input
            type="date"
            value={activeUntil}
            min={todayValue()}
            onChange={(e) => setActiveUntil(e.target.value)}
            className="border border-surface-line rounded-lg px-3 py-2 text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
          />
        </label>

        {availabilityError && (
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-4">
            {availabilityError}
          </p>
        )}

        {selectedKeys.length > 0 && !availabilityError && (
          <div className="mb-4">
            <p className="text-ink-body font-medium text-sm mb-1">Desk</p>
            <p className="text-ink-muted text-xs mb-2">
              {availability
                ? `${availability.occurrences} booking${availability.occurrences === 1 ? '' : 's'} `
                  + `from now until ${activeUntil ? shortDay(activeUntil) : shortDay(availability.generatedThrough)}. `
                  + 'A desk has to be free for every one of them.'
                : loadingDesks ? 'Checking desks…' : ' '}
            </p>

            <DeskMap
              desks={(availability?.desks ?? []).map((d) => ({
                id: d.deskId,
                number: d.deskNumber,
                label: `Desk# ${d.deskNumber}`,
                status: deskState(d),
              }))}
              selectedDeskId={deskId}
              onSelect={(desk) => setDeskId(desk.id)}
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
              {chosen
                ? chosenUsable
                  ? `Desk# ${chosen.deskNumber} — free for all ${chosen.occurrences} days.`
                  : `Desk# ${chosen.deskNumber} can't cover every day. Pick another.`
                : 'Pick a desk.'}
            </p>
          </div>
        )}

        {error && (
          <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body font-semibold rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
