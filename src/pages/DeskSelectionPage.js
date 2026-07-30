import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import BackLink from '../components/BackLink';
import DeskMap, { DeskMapLegend, deskStatuses } from '../components/DeskMap';
import { getDesks, getReservationsForDate } from '../api/client';
import {
  OFFICE_START,
  OFFICE_END,
  SLOT_MINUTES,
  OFFICE_HOURS_LABEL,
  timeOptions,
  isWorkingDay,
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
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dateStr = searchParams.get('date') || todayValue();
  const startMin = parseInt(searchParams.get('startMin') || String(OFFICE_START), 10);
  const endMin = parseInt(searchParams.get('endMin') || String(OFFICE_START + 60), 10);

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

  const closedDay = !isWorkingDay(dateStr);

  // A desk is unavailable when an existing booking overlaps the chosen window,
  // so this refetches whenever the window moves — that is when the answer
  // changes.
  useEffect(() => {
    if (closedDay) { setDesks([]); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getDesks(), getReservationsForDate(dateStr)])
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
  }, [dateStr, startMin, endMin, closedDay]);

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center px-8 py-6 gap-4 bg-surface-page">
        {/* The window, editable in place. Changing it redraws the map below. */}
        <div className="w-full max-w-5xl bg-white rounded-xl border border-surface-line px-6 py-4 opacity-0 animate-fade-up">
          <div className="flex items-end justify-between gap-4 flex-wrap">
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
                  {timeOptions({ to: OFFICE_END - SLOT_MINUTES }).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
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
        </div>

        {closedDay && (
          <div className="w-full max-w-5xl bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-6 py-4 text-sm">
            The office is closed that day. Pick a weekday to see the floor plan.
          </div>
        )}

        {error && (
          <div className="w-full max-w-5xl bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-4 text-sm">
            {error}
          </div>
        )}

        {/* Floor plan with overlaid desks */}
        <div className="w-full max-w-5xl bg-white rounded-xl border border-surface-line p-3 opacity-0 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <DeskMap
          desks={desks}
          selectedDeskId={selectedDesk}
          onSelect={(desk) => setSelectedDesk(desk.id)}
          loading={loading}
        />
        </div>

        {/* Legend */}
        <div className="w-full max-w-5xl bg-white border border-surface-line rounded-xl p-4 text-xs text-ink-body self-start opacity-0 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <p className="font-semibold mb-2 text-mqd-title">Map Legend:</p>
          <DeskMapLegend />
        </div>

        {/* Back and Next as a pair. Duration is derivable, and reaching this
            page means a desk was being chosen, so the calendar restores exactly. */}
        <div className="w-full max-w-5xl flex items-center justify-between gap-4 opacity-0 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <BackLink
            to={`/calendar?startDate=${dateStr}&duration=${endMin - startMin}`
              + `&type=${searchParams.get('type') || 'hourly'}&deskChoice=pick`}
            label="Back to date and time"
          />
          <button
            disabled={!selectedDesk}
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
