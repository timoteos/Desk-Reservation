import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { getBookingsForDate } from '../data/mockReservations';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DAY_START = 480;  // 8:00 AM in minutes
const DAY_END   = 990;  // 4:30 PM in minutes
const INCREMENT = 30;   // 30-min slots

const toMinutes = (h, m) => h * 60 + m;

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

// Returns all available start times for a given duration and date's bookings
const getAvailableSlots = (durationMins, bookings) => {
  const slots = [];
  for (let start = DAY_START; start + durationMins <= DAY_END; start += INCREMENT) {
    const end = start + durationMins;
    const hasConflict = bookings.some(
      (b) => start < b.endMin && end > b.startMin
    );
    if (!hasConflict) {
      slots.push({ startMin: start, endMin: end, label: `${formatMinutes(start)} to ${formatMinutes(end)}` });
    }
  }
  return slots;
};

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

  const cells = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--)
    cells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, current: true });
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++)
    cells.push({ day: d, current: false });

  const isSelected = (cell) =>
    cell.current &&
    selected.getDate() === cell.day &&
    selected.getMonth() === viewMonth &&
    selected.getFullYear() === viewYear;

  const isPast = (cell) => {
    if (!cell.current) return true;
    return new Date(viewYear, viewMonth, cell.day) < earliest;
  };

  return (
    <div className="border border-gray-300 rounded p-5 w-80">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-gray-500 hover:text-gray-800 px-1 text-lg">‹</button>
        <div className="flex gap-2">
          <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={nextMonth} className="text-gray-500 hover:text-gray-800 px-1 text-lg">›</button>
      </div>

      <div className="grid grid-cols-7 text-center mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-xs text-gray-500 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 text-center">
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => !isPast(cell) && cell.current && onSelect(new Date(viewYear, viewMonth, cell.day))}
            disabled={isPast(cell) || !cell.current}
            className={`h-9 w-9 mx-auto rounded-full text-sm flex items-center justify-center transition
              ${isSelected(cell) ? 'bg-gray-900 text-white font-bold' : ''}
              ${!isSelected(cell) && cell.current && !isPast(cell) ? 'hover:bg-gray-100 text-gray-800' : ''}
              ${isPast(cell) || !cell.current ? 'text-gray-300 cursor-default' : ''}
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

  const durationMins = parseInt(searchParams.get('duration') || '60', 10);

  const [selectedDate, setSelectedDate] = useState(initDate);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const dateStr = selectedDate.toISOString().split('T')[0];
  const bookings = getBookingsForDate(dateStr);
  const availableSlots = getAvailableSlots(durationMins, bookings);

  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const durationLabel = durationMins >= 60
    ? `${durationMins / 60} hour${durationMins > 60 ? 's' : ''}`
    : `${durationMins} minutes`;

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex items-center justify-center gap-16 px-8 py-10">
        <Calendar
          selected={selectedDate}
          onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
          minDate={initDate()}
        />

        {/* Time slot panel */}
        <div className="bg-gray-200 rounded p-6 w-80 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-gray-700 font-medium">{formattedDate}</p>
            <p className="text-gray-500 text-xs mt-1">{durationLabel} blocks</p>
          </div>

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {availableSlots.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">
                No availability for {durationLabel} on this day.
              </p>
            ) : (
              availableSlots.map((slot) => (
                <button
                  key={slot.startMin}
                  onClick={() => setSelectedSlot(slot)}
                  className={`w-full border py-3 rounded text-sm transition
                    ${selectedSlot?.startMin === slot.startMin
                      ? 'border-mqd-btn bg-mqd-btn text-white'
                      : 'border-mqd-btn bg-white text-mqd-btn hover:bg-mqd-btn hover:text-white'
                    }`}
                >
                  {slot.label}
                </button>
              ))
            )}
          </div>

          <button
            disabled={!selectedSlot}
            className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition mt-auto"
          >
            Next Page →
          </button>
        </div>
      </div>
    </>
  );
}
