import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import BackLink from '../components/BackLink';
import DeskMap, { DeskMapLegend, deskStatuses } from '../components/DeskMap';
import { getDesks, getReservationsForDate } from '../api/client';
import { resourceLabel } from '../lib/resourceLabel';
import {
  OFFICE_START,
  OFFICE_END,
  SLOT_MINUTES,
  OFFICE_HOURS_LABEL,
  timeOptions,
  isWorkingDay,
  earliestStartOn,
  formatMinutes,
} from '../lib/officeHours';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Desk Selection', path: '/desk-selection' },
];

const todayValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// The map and the window are editable together, so the page answers both
// questions people actually arrive with: "what is free at 9am?" and "when can I
// have Desk# 7?". Someone who cares about a particular desk nudges the time
// until it turns green rather than walking back to the calendar to guess.
//
// The window lives in the URL rather than in state, so the value the map is
// showing is the value the Back link and Next Page carry — and a refresh or a
// shared link lands on the same thing.
export default function DeskSelectionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedDesk, setSelectedDesk] = useState(null);
  // One floor, one map: desks and conference rooms together, because that is
  // what the office is. The marker tells them apart — "511A" does not read as a
  // desk beside "1" — and the rules that differ are enforced where they apply
  // rather than by hiding half the plan behind a mode.
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Read defensively. These come from the URL, so they can be absent, malformed
  // or out of range — and an unvalidated parseInt gave NaN, which left the end
  // dropdown with no options at all and made every desk read as free, because
  // nothing overlaps NaN.
  const rawDate = searchParams.get('date') || '';
  const dateStr =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(new Date(`${rawDate}T00:00:00`).getTime())
      ? rawDate
      : todayValue();

  const readMinute = (key, fallback) => {
    const n = parseInt(searchParams.get(key) ?? '', 10);
    if (!Number.isFinite(n)) return fallback;
    const snapped = Math.round(n / SLOT_MINUTES) * SLOT_MINUTES;
    return Math.min(Math.max(snapped, OFFICE_START), OFFICE_END);
  };

  const startMin = Math.min(readMinute('startMin', OFFICE_START), OFFICE_END - SLOT_MINUTES);
  const endMin = Math.max(readMinute('endMin', startMin + 60), startMin + SLOT_MINUTES);

  // Both writers take the updater form so they read the latest params rather
  // than the ones captured when this render ran.
  //
  // This is not a full fix for concurrent writes: setSearchParams navigates
  // rather than setting state, so two writes inside one tick still end
  // last-wins. That needs two different controls changed before a repaint,
  // which no human interaction produces — a change event requires a paint
  // between them. Left as is rather than mirroring the window into local state,
  // which would mean two sources of truth for the same value.
  //
  // replace: true so nudging the time doesn't bury the calendar under a dozen
  // history entries the back button has to chew through.
  const setWindow = (next) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      Object.entries(next).forEach(([k, v]) => params.set(k, String(v)));
      return params;
    }, { replace: true });

  // Moving the start past the end drags the end along.
  const handleStartChange = (value) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('startMin', String(value));
      if (Number(params.get('endMin')) <= value) {
        params.set('endMin', String(Math.min(value + SLOT_MINUTES, OFFICE_END)));
      }
      return params;
    }, { replace: true });

  // The space currently picked, for the summary beside the legend.
  const chosen = desks.find((d) => String(d.id) === String(selectedDesk));

  const closedDay = !isWorkingDay(dateStr);

  // What is still bookable today. Without this the page would offer a window
  // that had already begun, and the refusal only arrived two screens later at
  // the email step.
  const earliest = earliestStartOn(dateStr);
  const dayOver = earliest > OFFICE_END - SLOT_MINUTES;
  const windowPassed = !closedDay && startMin < earliest;
  // Nothing on this day can be booked, so there is no plan worth drawing.
  const unbookable = closedDay || windowPassed;

  // A desk is unavailable when an existing booking overlaps the chosen window,
  // so this refetches whenever the window moves — that is when the answer
  // changes.
  useEffect(() => {
    // Clearing the selection matters as much as clearing the desks: picking a
    // desk and then moving the window backwards would otherwise leave a
    // selection standing with nothing on screen to contradict it.
    if (closedDay || windowPassed) {
      setDesks([]);
      setSelectedDesk(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getDesks('all'), getReservationsForDate(dateStr)])
      .then(([deskList, reservations]) => {
        if (cancelled) return;
        const withStatus = deskStatuses(deskList, reservations, startMin, endMin);
        setDesks(withStatus);
        // A desk free at one time may be taken at another. Drop the choice
        // rather than carrying a desk that can no longer be booked.
        setSelectedDesk((current) => {
          if (current == null) return null;
          const still = withStatus.find((d) => String(d.id) === String(current));
          return still && still.status !== 'booked' ? current : null;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateStr, startMin, endMin, closedDay, windowPassed]);

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center px-4 sm:px-8 py-6 gap-4 bg-surface-page">
        {/* One card, because this is one interaction: the window decides what
            the plan shows, and the plan is what the window is for. They were
            three separate panels, which put the legend below the fold and gave
            the same job three borders and three drop shadows. */}
        <div className="w-full max-w-5xl bg-white rounded-xl border border-surface-line overflow-hidden opacity-0 animate-fade-up">
          <div className="flex items-end justify-between gap-4 flex-wrap px-5 sm:px-6 py-4 border-b border-surface-line">
            <div>
              <h2 className="text-lg font-semibold text-mqd-title">{formatDate(dateStr)}</h2>
              <p className="text-ink-muted text-sm mt-0.5">
                Adjust the window and the plan updates. Office hours are {OFFICE_HOURS_LABEL},
                Monday to Friday.
              </p>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-sm">
                <span className="block text-ink-body font-medium mb-1">Date</span>
                <input
                  type="date"
                  value={dateStr}
                  min={todayValue()}
                  onChange={(e) => setWindow({ date: e.target.value })}
                  className="border border-surface-line rounded-lg px-3 py-2 text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </label>
              <label className="text-sm">
                <span className="block text-ink-body font-medium mb-1">From</span>
                <select
                  value={startMin}
                  onChange={(e) => handleStartChange(Number(e.target.value))}
                  className="border border-surface-line rounded-lg px-3 py-2 text-ink-body bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {/* Elapsed slots are absent, not disabled. A list that opens
                      on 7:30 AM at four in the afternoon makes somebody scroll
                      past eighteen dead rows to reach the one they can pick,
                      and a greyed row still reads as a choice that exists.
                      Clamped so the last slot of the day is always offered —
                      an empty select would say nothing at all about why. */}
                  {timeOptions({
                    from: Math.min(earliest, OFFICE_END - SLOT_MINUTES),
                    to: OFFICE_END - SLOT_MINUTES,
                  }).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-ink-body font-medium mb-1">To</span>
                <select
                  value={endMin}
                  onChange={(e) => setWindow({ endMin: Number(e.target.value) })}
                  className="border border-surface-line rounded-lg px-3 py-2 text-ink-body bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                >
                  {timeOptions({ from: startMin + SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* A day with nothing to show says so where the plan would be, rather
              than stacking a banner above an empty floor. */}
          {unbookable ? (
            <p className="px-5 sm:px-6 py-10 text-center text-sm text-ink-muted">
              {closedDay
                ? 'The office is closed that day. Pick a weekday to see the floor plan.'
                : dayOver
                  ? 'The office day has finished. Pick another date.'
                  : `That time has already passed. The next bookable slot today is ${formatMinutes(earliest)}.`}
            </p>
          ) : (
            <>
              <div className="p-3 sm:p-4">
                <DeskMap
                  desks={desks}
                  selectedDeskId={selectedDesk}
                  onSelect={(desk) => setSelectedDesk(desk.id)}
                  loading={loading}
                />
              </div>

              {/* The legend sits with the map instead of in a panel below it,
                  where it could not be read while looking at what it explains.
                  What has been picked sits opposite, directly above the button
                  it enables. */}
              <div className="flex items-start justify-between gap-4 flex-wrap
                              px-5 sm:px-6 py-3 border-t border-surface-line bg-surface-panel/40">
                <DeskMapLegend />
                <p className="text-sm text-ink-muted">
                  {chosen ? (
                    <>
                      <span className="font-semibold text-mqd-title">{resourceLabel(chosen)}</span>
                      {chosen.capacity != null && ` · seats ${chosen.capacity}`}
                      {chosen.resourceType === 'room' && (
                        <span className="block text-xs mt-0.5">
                          Booked by MQD staff. A visitor attends as their guest.
                        </span>
                      )}
                    </>
                  ) : 'Nothing selected yet'}
                </p>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="w-full max-w-5xl bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-4 text-sm">
            {error}
          </div>
        )}

        {/* Back and Next as a pair. Duration is derivable, and reaching this
            page means a desk was being chosen, so the calendar restores exactly. */}
        <div className="w-full max-w-5xl flex items-center justify-between gap-4 opacity-0 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <BackLink
            to={`/calendar?startDate=${dateStr}&duration=${endMin - startMin}`
              + `&type=${searchParams.get('type') || 'hourly'}&deskChoice=pick`}
            label="Back to date and time"
          />
          <button
            disabled={!selectedDesk || closedDay || windowPassed}
            onClick={() => {
              if (!selectedDesk) return;
              // deskId identifies the row for the booking; deskNumber is what a
              // person recognises, so the confirmation page shows the latter.
              const desk = desks.find((d) => d.id === selectedDesk);
              navigate(
                `/request?deskId=${selectedDesk}&deskNumber=${desk?.number ?? ''}` +
                `&date=${dateStr}&startMin=${startMin}&endMin=${endMin}`
              );
            }}
            className="bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded transition flex items-center gap-2"
          >
            Next Page
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
