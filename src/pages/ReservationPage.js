import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
];

const today = new Date().toISOString().split('T')[0];
const MINS_IN_WORKDAY = 510; // 8:00 AM to 4:30 PM

export default function ReservationPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('hourly');
  const [count, setCount] = useState(1);
  const [noEarlierThan, setNoEarlierThan] = useState('');

  const decrement = () => setCount((prev) => Math.max(1, prev - 1));
  const increment = () => {
    const max = type === 'hourly' ? 8 : 5;
    setCount((prev) => Math.min(max, prev + 1));
  };

  const handleSeeAvailability = () => {
    const startDate = noEarlierThan || today;
    const durationMins = type === 'hourly' ? count * 60 : MINS_IN_WORKDAY * count;
    navigate(`/calendar?startDate=${startDate}&duration=${durationMins}&type=${type}`);
  };

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-lg flex flex-col gap-6">

          {/* Reservation type toggle */}
          <div>
            <p className="text-gray-700 font-medium mb-2">Reservation type</p>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => { setType('hourly'); setCount(1); }}
                className={`flex-1 py-3 text-sm font-semibold transition
                  ${type === 'hourly' ? 'bg-mqd-btn text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Hourly
              </button>
              <button
                onClick={() => { setType('full'); setCount(1); }}
                className={`flex-1 py-3 text-sm font-semibold transition border-l border-gray-300
                  ${type === 'full' ? 'bg-mqd-btn text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Full day(s)
              </button>
            </div>
          </div>

          {/* Count stepper */}
          <div>
            <p className="text-gray-700 font-medium mb-2">
              {type === 'full' ? 'Number of days' : 'Number of hours'}
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={decrement}
                className="w-12 h-12 rounded-lg border border-gray-300 text-gray-700 text-xl font-bold hover:bg-gray-100 transition flex items-center justify-center"
              >
                −
              </button>
              <span className="text-gray-800 text-xl font-semibold w-6 text-center">{count}</span>
              <button
                onClick={increment}
                className="w-12 h-12 rounded-lg border border-gray-300 text-gray-700 text-xl font-bold hover:bg-gray-100 transition flex items-center justify-center"
              >
                +
              </button>
              <span className="text-gray-400 text-sm">
                {type === 'full' ? 'day(s), full workday each' : 'hour(s)'}
              </span>
            </div>
          </div>

          {/* No earlier than */}
          <div>
            <p className="text-gray-700 font-medium mb-2">
              No earlier than <span className="text-gray-400 font-normal">(optional)</span>
            </p>
            <input
              type="date"
              value={noEarlierThan}
              min={today}
              onChange={(e) => setNoEarlierThan(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          </div>

          {/* See availability */}
          <button
            onClick={handleSeeAvailability}
            className="w-full bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold py-4 rounded-lg text-base transition"
          >
            See availability ↗
          </button>

          <button className="flex items-center justify-center gap-2 text-mqd-btn hover:underline text-sm font-medium">
            <span>↺</span>
            <span>Set up a recurring schedule</span>
          </button>

        </div>
      </div>
    </>
  );
}
