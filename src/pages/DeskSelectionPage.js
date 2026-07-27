import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { getDesks, getReservationsForDate } from '../api/client';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
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

// Desk positions as % of the floor plan image — left/top mark the CENTRE of
// each cubicle, measured from the image pixels (bay pitch ~88px of 1388).
// transform: translate(-50%, -50%) keeps the label centred on that point.
//
// Positions stay here rather than in the database until the admin map editor
// exists; keyed by desk number so they survive the desks coming from the API.
const DESK_POSITIONS = {
  1:  { left: '23.9%', top: '22%' },
  2:  { left: '30.3%', top: '22%' },
  3:  { left: '36.7%', top: '22%' },
  4:  { left: '43.1%', top: '22%' },
  5:  { left: '49.5%', top: '22%' },
  6:  { left: '55.8%', top: '22%' },
  7:  { left: '62.3%', top: '22%' },
  8:  { left: '68.6%', top: '22%' },
  9:  { left: '51.6%', top: '75%' },
  10: { left: '58.2%', top: '75%' },
  11: { left: '64.4%', top: '75%' },
  12: { left: '71%',   top: '75%' },
};

// Two ranges collide when each starts before the other ends.
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

const deskColor = (status, selected) => {
  if (selected) return 'bg-mqd-title ring-2 ring-mqd-title/40';
  if (status === 'booked') return 'bg-rose-500 opacity-85';
  if (status === 'partial') return 'bg-amber-400';
  return 'bg-emerald-500';
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
        setDesks(
          deskList.map((desk) => ({
            ...desk,
            status: reservations.some(
              (r) => r.deskNumber === desk.number && overlaps(startMin, endMin, r.startMin, r.endMin)
            )
              ? 'booked'
              : 'available',
          }))
        );
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
        <div className="relative">
          {/* Map image at its natural aspect ratio so % overlays track it exactly */}
          <img
            src={`${process.env.PUBLIC_URL}/office-map.png`}
            alt="Office floor plan"
            className="block w-full h-auto rounded-lg border border-gray-200"
          />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
              <p className="text-gray-600 text-sm font-medium">Checking desk availability…</p>
            </div>
          )}

          {/* Desk overlays */}
          {desks.map((desk) => {
            const position = DESK_POSITIONS[desk.number];
            if (!position) return null;
            const isSelected = selectedDesk === desk.id;
            const clickable = desk.status !== 'booked';
            return (
              <div
                key={desk.id}
                onClick={() => clickable && setSelectedDesk(desk.id)}
                className={`absolute flex items-center justify-center rounded text-white font-bold shadow-md transition select-none whitespace-nowrap overflow-hidden
                  ${deskColor(desk.status, isSelected)}
                  ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed'}
                `}
                style={{
                  left: position.left,
                  top: position.top,
                  transform: 'translate(-50%, -50%)',
                  width: '5.5%',
                  height: '10%',
                  fontSize: 'clamp(0.4rem, 1.1vw, 0.6rem)',
                  padding: '0 4px',
                }}
              >
                <span className="hidden sm:inline">{desk.label}</span>
                <span className="sm:hidden">{desk.number}</span>
              </div>
            );
          })}
        </div>
        </div>

        {/* Legend */}
        <div className="w-full max-w-5xl bg-white border border-gray-100 rounded-xl p-4 text-xs text-gray-700 shadow-md self-start opacity-0 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <p className="font-semibold mb-2 text-mqd-title">Map Legend:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-emerald-500" />
              <span>Green - Fully Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-rose-500" />
              <span>Red - Fully Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-amber-400" />
              <span>Orange - Partially Available (no extension)</span>
            </div>
          </div>
        </div>

        {/* Next button */}
        <div className="w-full max-w-5xl flex justify-end opacity-0 animate-fade-up" style={{ animationDelay: '300ms' }}>
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
