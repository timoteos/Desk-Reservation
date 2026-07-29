import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import BackLink from '../components/BackLink';
import DeskMap, { DeskMapLegend, deskStatuses } from '../components/DeskMap';
import { getDesks, getReservationsForDate } from '../api/client';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Desk Selection', path: '/desk-selection' },
];

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

export default function DeskSelectionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedDesk, setSelectedDesk] = useState(null);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dateStr = searchParams.get('date') || '';
  const startMin = parseInt(searchParams.get('startMin') || '480', 10);
  const endMin = parseInt(searchParams.get('endMin') || '540', 10);

  // A desk is unavailable when an existing booking overlaps the chosen window.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getDesks(), dateStr ? getReservationsForDate(dateStr) : Promise.resolve([])])
      .then(([deskList, reservations]) => {
        if (cancelled) return;
        setDesks(deskStatuses(deskList, reservations, startMin, endMin));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateStr, startMin, endMin]);

  const dateLabel = formatDate(dateStr);
  const timeLabel = `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`;

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center px-8 py-6 gap-4 bg-gray-50">
        {/* Date / time header */}
        <div className="flex items-center justify-between w-full max-w-5xl bg-white rounded-xl shadow-md border border-gray-100 px-6 py-4 opacity-0 animate-fade-up">
          <h2 className="text-lg font-semibold text-mqd-title">{dateLabel}</h2>
          <h2 className="text-lg font-semibold text-mqd-title">{timeLabel}</h2>
        </div>

        {error && (
          <div className="w-full max-w-5xl bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-4 text-sm">
            {error}
          </div>
        )}

        {/* Floor plan with overlaid desks */}
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-md border border-gray-100 p-3 opacity-0 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <DeskMap
          desks={desks}
          selectedDeskId={selectedDesk}
          onSelect={(desk) => setSelectedDesk(desk.id)}
          loading={loading}
        />
        </div>

        {/* Legend */}
        <div className="w-full max-w-5xl bg-white border border-gray-100 rounded-xl p-4 text-xs text-gray-700 shadow-md self-start opacity-0 animate-fade-up" style={{ animationDelay: '200ms' }}>
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
