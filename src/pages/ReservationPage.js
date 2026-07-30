import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, RotateCcw, Clock, CalendarDays, LayoutGrid, Shuffle } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { MINS_IN_WORKDAY } from '../lib/officeHours';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
];

const today = new Date().toISOString().split('T')[0];


export default function ReservationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Restored when arriving back from the calendar, so stepping backwards
  // doesn't discard what was already chosen.
  const initialType = searchParams.get('type') === 'full' ? 'full' : 'hourly';
  const initialDuration = parseInt(searchParams.get('duration') || '', 10);
  const initialCount = Number.isNaN(initialDuration)
    ? 1
    : Math.max(1, Math.round(initialDuration / (initialType === 'full' ? MINS_IN_WORKDAY : 60)));

  const [type, setType] = useState(initialType);
  const [count, setCount] = useState(initialCount);
  const [noEarlierThan, setNoEarlierThan] = useState(searchParams.get('startDate') || '');
  const [deskChoice, setDeskChoice] = useState(
    searchParams.get('deskChoice') === 'auto' ? 'auto' : 'pick'
  );

  // A full day already fills the office day, so two of them cannot fit inside
  // one booking. The stepper used to allow up to five, which asked the calendar
  // for a window longer than the day and reported "no availability" on every
  // date — blaming occupancy for something that was never bookable.
  //
  // Multi-day stays are made as one booking per day until the calendar can span
  // dates, so the count is capped rather than the message reworded.
  const maxCount = type === 'hourly' ? 8 : 1;

  const decrement = () => setCount((prev) => Math.max(1, prev - 1));
  const increment = () => setCount((prev) => Math.min(maxCount, prev + 1));

  const handleSeeAvailability = () => {
    const startDate = noEarlierThan || today;
    const durationMins = type === 'hourly' ? count * 60 : MINS_IN_WORKDAY * count;
    navigate(
      `/calendar?startDate=${startDate}&duration=${durationMins}&type=${type}&deskChoice=${deskChoice}`
    );
  };

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-surface-page">
        <div className="w-full max-w-lg flex flex-col gap-6 bg-white rounded-xl border border-surface-line p-8 opacity-0 animate-fade-up">

          <div>
            <h1 className="text-mqd-title text-2xl font-bold">Make a Reservation</h1>
            <p className="text-ink-muted text-sm mt-1">Tell us what you need and we'll show you what's available.</p>
          </div>

          {/* Reservation type toggle */}
          <div>
            <p className="text-ink-body font-medium mb-2">Reservation type</p>
            <div className="flex rounded-lg border border-surface-line overflow-hidden">
              <button
                onClick={() => { setType('hourly'); setCount(1); }}
                className={`flex-1 py-3 text-sm font-semibold transition flex items-center justify-center gap-2
                  ${type === 'hourly' ? 'bg-mqd-btn text-white' : 'bg-white text-ink-body hover:bg-surface-page'}`}
              >
                <Clock className="w-4 h-4" />
                Hourly
              </button>
              <button
                onClick={() => { setType('full'); setCount(1); }}
                className={`flex-1 py-3 text-sm font-semibold transition border-l border-surface-line flex items-center justify-center gap-2
                  ${type === 'full' ? 'bg-mqd-btn text-white' : 'bg-white text-ink-body hover:bg-surface-page'}`}
              >
                <CalendarDays className="w-4 h-4" />
                Full day(s)
              </button>
            </div>
          </div>

          {/* Count stepper */}
          <div>
            <p className="text-ink-body font-medium mb-2">
              {type === 'full' ? 'Number of days' : 'Number of hours'}
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={decrement}
                disabled={count <= 1}
                className="w-12 h-12 rounded-lg border border-surface-line text-ink-body text-xl font-bold hover:bg-surface-panel disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition flex items-center justify-center"
              >
                −
              </button>
              <span className="text-mqd-title text-xl font-semibold w-10 h-10 flex items-center justify-center rounded-lg bg-mqd-btn/10">{count}</span>
              <button
                onClick={increment}
                disabled={count >= maxCount}
                className="w-12 h-12 rounded-lg border border-surface-line text-ink-body text-xl font-bold hover:bg-surface-panel disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition flex items-center justify-center"
              >
                +
              </button>
              <span className="text-ink-muted text-sm">
                {type === 'full'
                  ? 'full workday — book each day separately'
                  : 'hour(s)'}
              </span>
            </div>
          </div>

          {/* No earlier than */}
          <div>
            <p className="text-ink-body font-medium mb-2">
              No earlier than <span className="text-ink-muted font-normal">(optional)</span>
            </p>
            <input
              type="date"
              value={noEarlierThan}
              min={today}
              onChange={(e) => setNoEarlierThan(e.target.value)}
              className="w-full border border-surface-line rounded-lg px-4 py-3 text-ink-body text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          </div>

          {/* Desk choice */}
          <div>
            <p className="text-ink-body font-medium mb-2">Desk</p>
            <div className="flex rounded-lg border border-surface-line overflow-hidden">
              <button
                onClick={() => setDeskChoice('pick')}
                className={`flex-1 py-3 text-sm font-semibold transition flex items-center justify-center gap-2
                  ${deskChoice === 'pick' ? 'bg-mqd-btn text-white' : 'bg-white text-ink-body hover:bg-surface-page'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                I'll choose
              </button>
              <button
                onClick={() => setDeskChoice('auto')}
                className={`flex-1 py-3 text-sm font-semibold transition border-l border-surface-line flex items-center justify-center gap-2
                  ${deskChoice === 'auto' ? 'bg-mqd-btn text-white' : 'bg-white text-ink-body hover:bg-surface-page'}`}
              >
                <Shuffle className="w-4 h-4" />
                Assign me one
              </button>
            </div>
            <p className="text-ink-muted text-xs mt-2">
              {deskChoice === 'pick'
                ? 'Pick your desk from the office floor plan.'
                : 'Skip the floor plan — any free desk is assigned for you.'}
            </p>
          </div>

          {/* See availability */}
          <button
            onClick={handleSeeAvailability}
            className="w-full bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold py-4 rounded-lg text-base transition flex items-center justify-center gap-2"
          >
            See availability
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate('/recurring-schedule')}
            className="flex items-center justify-center gap-2 text-mqd-btn hover:underline text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Set up a recurring schedule</span>
          </button>

        </div>
      </div>
    </>
  );
}
