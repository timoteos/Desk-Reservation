import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const TIME_SLOTS = [
  '8:30 AM to 10:30 AM',
  '10:30 AM to 12:30 PM',
  '12:30 PM to 2:30 PM',
  '2:30 PM to 4:30 PM',
];

function Calendar({ selected, onSelect, minDate }) {
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliest = minDate || today;

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() + i);

  // Build grid cells
  const cells = [];
  // Previous month overflow
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true });
  }
  // Next month overflow to fill 6 rows
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false });
  }

  const isSelected = (cell) =>
    cell.current &&
    selected.getDate() === cell.day &&
    selected.getMonth() === viewMonth &&
    selected.getFullYear() === viewYear;

  const isPast = (cell) => {
    if (!cell.current) return true;
    const d = new Date(viewYear, viewMonth, cell.day);
    return d < earliest;
  };

  const handleSelect = (cell) => {
    if (!cell.current || isPast(cell)) return;
    onSelect(new Date(viewYear, viewMonth, cell.day));
  };

  return (
    <div className="border border-gray-300 rounded p-5 w-80">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-gray-500 hover:text-gray-800 px-1 text-lg">‹</button>
        <div className="flex gap-2">
          <select
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={nextMonth} className="text-gray-500 hover:text-gray-800 px-1 text-lg">›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-xs text-gray-500 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 text-center">
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleSelect(cell)}
            disabled={!cell.current || isPast(cell)}
            className={`h-9 w-9 mx-auto rounded-full text-sm flex items-center justify-center transition
              ${isSelected(cell) ? 'bg-gray-900 text-white font-bold' : ''}
              ${!isSelected(cell) && cell.current && !isPast(cell) ? 'hover:bg-gray-100 text-gray-800' : ''}
              ${!cell.current ? 'text-gray-300 cursor-default' : ''}
              ${cell.current && isPast(cell) ? 'text-gray-300 cursor-not-allowed' : ''}
            `}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [searchParams] = useSearchParams();

  const initDate = () => {
    const param = searchParams.get('startDate');
    if (param) {
      const d = new Date(param + 'T00:00:00');
      if (!isNaN(d)) return d;
    }
    return new Date();
  };

  const [selectedDate, setSelectedDate] = useState(initDate);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex items-center justify-center gap-16 px-8 py-10">
        {/* Calendar */}
        <Calendar
          selected={selectedDate}
          onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
          minDate={initDate()}
        />

        {/* Time slot panel */}
        <div className="bg-gray-200 rounded p-6 w-80 flex flex-col gap-4">
          <p className="text-center text-gray-700 font-medium">{formattedDate}</p>

          <div className="flex flex-col gap-3">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                className={`w-full border py-3 rounded text-sm transition
                  ${selectedSlot === slot
                    ? 'border-mqd-btn bg-mqd-btn text-white'
                    : 'border-mqd-btn bg-white text-mqd-btn hover:bg-mqd-btn hover:text-white'
                  }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <button
            disabled={!selectedSlot}
            className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition mt-2"
          >
            Next Page →
          </button>
        </div>
      </div>
    </>
  );
}
