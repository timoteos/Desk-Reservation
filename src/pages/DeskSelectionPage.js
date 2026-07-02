import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';

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

// Desk positions as % of image — left/top = CENTER of each cubicle,
// measured from the actual floor plan pixels (bay pitch ~88px of 1388)
// transform: translate(-50%, -50%) keeps the label centered on that point
const DESKS = [
  { id: 1,  label: 'Desk# 1',  status: 'booked',     left: '23.9%', top: '22%' },
  { id: 2,  label: 'Desk# 2',  status: 'booked',     left: '30.3%', top: '22%' },
  { id: 3,  label: 'Desk# 3',  status: 'booked',     left: '36.7%', top: '22%' },
  { id: 4,  label: 'Desk# 4',  status: 'booked',     left: '43.1%', top: '22%' },
  { id: 5,  label: 'Desk# 5',  status: 'booked',     left: '49.5%', top: '22%' },
  { id: 6,  label: 'Desk# 6',  status: 'booked',     left: '55.8%', top: '22%' },
  { id: 7,  label: 'Desk# 7',  status: 'available',  left: '62.3%', top: '22%' },
  { id: 8,  label: 'Desk# 8',  status: 'available',  left: '68.6%', top: '22%' },
  { id: 9,  label: 'Desk# 9',  status: 'available',  left: '51.6%', top: '75%' },
  { id: 10, label: 'Desk# 10', status: 'available',  left: '58.2%', top: '75%' },
  { id: 11, label: 'Desk# 11', status: 'available',  left: '64.4%', top: '75%' },
  { id: 12, label: 'Desk# 12', status: 'available',  left: '71%',   top: '75%' },
];

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

  const dateStr = searchParams.get('date') || '';
  const startMin = parseInt(searchParams.get('startMin') || '480', 10);
  const endMin = parseInt(searchParams.get('endMin') || '540', 10);

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

        {/* Floor plan with overlaid desks */}
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-md border border-gray-100 p-3 opacity-0 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="relative">
          {/* Map image at its natural aspect ratio so % overlays track it exactly */}
          <img
            src={`${process.env.PUBLIC_URL}/office-map.png`}
            alt="Office floor plan"
            className="block w-full h-auto rounded-lg border border-gray-200"
          />

          {/* Desk overlays */}
          {DESKS.map((desk) => {
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
                  left: desk.left,
                  top: desk.top,
                  transform: 'translate(-50%, -50%)',
                  width: '5.5%',
                  height: '10%',
                  fontSize: 'clamp(0.4rem, 1.1vw, 0.6rem)',
                  padding: '0 4px',
                }}
              >
                <span className="hidden sm:inline">{desk.label}</span>
                <span className="sm:hidden">{desk.id}</span>
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
              navigate(`/request?desk=${selectedDesk}&date=${dateStr}&startMin=${startMin}&endMin=${endMin}`);
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
