import { useState } from 'react';
import { CalendarCheck, CalendarX, CalendarOff } from 'lucide-react';
import { cancelScheduleDay } from '../api/client';
import { SCHEDULE_STATUS_LABELS, STATUS_STYLES, isLiveStatus } from '../lib/bookingStatus';
import { resourceLabel } from '../lib/resourceLabel';

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const longDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

const shortDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

// Mon, Tue and Wed rather than three lines, unless the hours differ between them
// — in which case the hours are the point and each day says its own.
const describePattern = (pattern) => {
  const sameHours = pattern.every(
    (p) => p.startMin === pattern[0].startMin && p.endMin === pattern[0].endMin
  );
  if (sameHours && pattern.length > 0) {
    return [{
      days: pattern.map((p) => p.day.slice(0, 3)).join(', '),
      hours: `${formatMinutes(pattern[0].startMin)} – ${formatMinutes(pattern[0].endMin)}`,
    }];
  }
  return pattern.map((p) => ({
    days: p.day,
    hours: `${formatMinutes(p.startMin)} – ${formatMinutes(p.endMin)}`,
  }));
};

// A schedule as the person holding it sees it: one arrangement, one code.
//
// It used to arrive as up to 39 separate bookings each with a code of its own,
// which is what generating a row per occurrence looks like when it leaks through
// to the person. The rows still exist — the database needs them to guarantee
// nobody else gets the desk — but they are listed here as days, not as bookings,
// and none of them has a code to confuse anyone.
export default function ScheduleResult({ schedule, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [confirmingDay, setConfirmingDay] = useState(null);
  const [error, setError] = useState(null);

  const lines = describePattern(schedule.pattern);
  const live = isLiveStatus(schedule.status);

  const cancelDay = async (occurrence) => {
    setBusyId(occurrence.id);
    setError(null);
    try {
      await cancelScheduleDay(schedule.confirmationCode, occurrence.id);
      setConfirmingDay(null);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-surface-line pt-5">
      <div className="flex flex-col items-center gap-2 text-center">
        {live ? (
          <CalendarCheck className="w-10 h-10 text-mqd-title" />
        ) : (
          <CalendarOff className="w-10 h-10 text-ink-muted" />
        )}
        <p className={`font-semibold ${live ? 'text-mqd-title' : 'text-ink-body'}`}>
          {live ? 'Recurring schedule found' : 'This schedule is no longer running'}
        </p>
      </div>

      <div className="bg-surface-page border border-surface-line rounded-lg p-4 text-sm text-ink-body w-full flex flex-col gap-1">
        <p><span className="font-semibold text-mqd-title">Name:</span> {schedule.user}</p>
        <p><span className="font-semibold text-mqd-title">Desk:</span> {resourceLabel(schedule)}</p>

        {lines.map((l) => (
          <p key={l.days}>
            <span className="font-semibold text-mqd-title">{lines.length > 1 ? l.days : 'Days'}:</span>{' '}
            {lines.length > 1 ? l.hours : `${l.days} · ${l.hours}`}
          </p>
        ))}

        {schedule.activeFrom && (
          <p>
            <span className="font-semibold text-mqd-title">Runs:</span>{' '}
            {longDate(schedule.activeFrom)}
            {schedule.openEnded
              ? ' onwards'
              : schedule.activeUntil && ` to ${longDate(schedule.activeUntil)}`}
          </p>
        )}

        <p className="flex items-center gap-2 pt-1">
          <span className="font-semibold text-mqd-title">Status:</span>
          <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLES[schedule.status] || 'bg-surface-panel text-ink-body'}`}>
            {SCHEDULE_STATUS_LABELS[schedule.status] || schedule.status}
          </span>
        </p>

        <p>
          <span className="font-semibold text-mqd-title">Code:</span>{' '}
          <span className="font-mono tracking-wider">{schedule.confirmationCode}</span>
        </p>
        {live && (
          <p className="text-ink-muted text-xs">
            One code for the whole schedule — the same one every day you come in.
          </p>
        )}
      </div>

      {schedule.today && (
        <p className="bg-mqd-50 border border-mqd-200 text-ink-body rounded-lg px-4 py-3 text-sm">
          <span className="font-semibold text-mqd-title">Today:</span> Desk#{' '}
          {schedule.deskNumber}, {formatMinutes(schedule.today.startMin)} –{' '}
          {formatMinutes(schedule.today.endMin)}.
        </p>
      )}

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {live && (
        <div className="flex flex-col gap-2">
          <p className="text-ink-body text-sm font-medium">
            {schedule.bookingsRemaining} day{schedule.bookingsRemaining === 1 ? '' : 's'} coming up
          </p>

          {schedule.upcoming.length === 0 ? (
            <p className="text-ink-muted text-sm">
              No days left to come. {schedule.openEnded
                ? 'Contact your administrator to extend this schedule.'
                : 'This schedule has run its course.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {schedule.upcoming.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 bg-white border border-surface-line rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-ink-body text-sm">{shortDate(o.date)}</p>
                    <p className="text-ink-muted text-xs">
                      {formatMinutes(o.startMin)} – {formatMinutes(o.endMin)}
                    </p>
                  </div>

                  {confirmingDay === o.id ? (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => cancelDay(o)}
                        disabled={busyId === o.id}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold px-2.5 py-1.5 rounded transition"
                      >
                        {busyId === o.id ? 'Releasing…' : 'Release it'}
                      </button>
                      <button
                        onClick={() => setConfirmingDay(null)}
                        disabled={busyId === o.id}
                        className="border border-surface-line hover:bg-surface-panel disabled:opacity-40 text-ink-body text-xs font-semibold px-2.5 py-1.5 rounded transition"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setConfirmingDay(o.id); setError(null); }}
                      className="shrink-0 text-ink-muted hover:text-red-700 text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <CalendarX className="w-3.5 h-3.5" />
                      Not coming in
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-ink-muted text-xs">
            Releasing a day frees the desk for somebody else. The rest of your schedule stays.
          </p>
        </div>
      )}
    </div>
  );
}
