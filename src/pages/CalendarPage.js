import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import BackLink from '../components/BackLink';
import { getReservationsForDate, getDesks } from '../api/client';
import {
  OFFICE_START as DAY_START,
  OFFICE_END as DAY_END,
  SLOT_MINUTES as INCREMENT,
  WORKING_DAYS,
  formatMinutes,
} from '../lib/officeHours';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  { label: 'Calendar', path: '/calendar' },
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];


// Available start times for a duration, given the day's existing bookings.
//
// `earliestMin` drops slots that have already started — without it the day's
// full 8:00–4:30 range is offered even at 4pm, and booking a slot in the past
// produces a request that expires the moment it's made.
//
// A booking only rules out the desk it sits on, so a slot is unavailable only
// once every desk is taken for that window. Treating any booking as blocking
// would let one all-day reservation close the whole office.
const getAvailableSlots = (durationMins, bookings, earliestMin = 0, deskCount = 0) => {
  const slots = [];
  for (let start = DAY_START; start + durationMins <= DAY_END; start += INCREMENT) {
    const end = start + durationMins;
    if (start < earliestMin) continue;
    const taken = new Set(
      bookings
        .filter((b) => start < b.endMin && end > b.startMin)
        .map((b) => b.deskId)
    );
    if (taken.size < deskCount) {
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

  // Weekends are unselectable for the same reason past dates are: the office is
  // shut, so offering the date only leads to a rejection later.
  const isClosed = (cell) => {
    if (!cell.current) return true;
    const date = new Date(viewYear, viewMonth, cell.day);
    return date < earliest || !WORKING_DAYS.includes(date.getDay());
  };

  return (
    <div className="bg-white rounded-xl border border-surface-line p-5 w-80 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-ink-muted hover:text-mqd-btn p-1 rounded transition">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-2">
          <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}
            className="border border-surface-line rounded px-2 py-1 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
            className="border border-surface-line rounded px-2 py-1 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-mqd-btn">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={nextMonth} className="text-ink-muted hover:text-mqd-btn p-1 rounded transition">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-xs text-ink-muted font-medium py-1">{d}</div>
        ))}
      </div>

      <div key={`${viewYear}-${viewMonth}`} className="grid grid-cols-7 text-center animate-fade-scale">
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => !isClosed(cell) && onSelect(new Date(viewYear, viewMonth, cell.day))}
            disabled={isClosed(cell)}
            className={`h-9 w-9 mx-auto rounded-full text-sm flex items-center justify-center transition
              ${isSelected(cell) ? 'bg-mqd-btn text-white font-bold' : ''}
              ${!isSelected(cell) && !isClosed(cell) ? 'hover:bg-mqd-btn/10 text-ink' : ''}
              ${isClosed(cell) ? 'text-mqd-200 cursor-default' : ''}
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
  const navigate = useNavigate();

  // Weekends cannot be selected, so the page must not open on one either —
  // otherwise landing here on a Saturday shows a day nothing can be booked on.
  // Normalised to midnight because this value is also the calendar's floor, and
  // the cells are midnight. Carrying the current time made every cell for today
  // compare as earlier than the floor, so today could never be selected —
  // despite slot filtering existing precisely so that today stays bookable.
  const nextWorkingDay = (d) => {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    while (!WORKING_DAYS.includes(out.getDay())) out.setDate(out.getDate() + 1);
    return out;
  };

  const initDate = () => {
    const param = searchParams.get('startDate');
    if (param) {
      const d = new Date(param + 'T00:00:00');
      if (!isNaN(d)) return nextWorkingDay(d);
    }
    return nextWorkingDay(new Date());
  };

  const durationMins = parseInt(searchParams.get('duration') || '60', 10);

  const [selectedDate, setSelectedDate] = useState(initDate);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [deskCount, setDeskCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // How many desks exist decides when a slot is genuinely full, so the office
  // gaining or losing a desk shouldn't need a code change here.
  useEffect(() => {
    let cancelled = false;
    getDesks()
      .then((desks) => { if (!cancelled) setDeskCount(desks.length); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Local calendar date — toISOString() converts to UTC and can roll the date.
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getReservationsForDate(dateStr)
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Ignore a response that arrives after the user has moved to another date.
    return () => { cancelled = true; };
  }, [dateStr]);

  // Only today is constrained by the clock; future dates offer the full day.
  const now = new Date();
  const isToday = dateStr === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const earliestMin = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  const availableSlots = getAvailableSlots(durationMins, bookings, earliestMin, deskCount ?? 0);

  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const durationLabel = durationMins >= 60
    ? `${durationMins / 60} hour${durationMins > 60 ? 's' : ''}`
    : `${durationMins} minutes`;

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-wrap items-center justify-center gap-8 md:gap-16 px-4 md:px-8 py-10 bg-surface-page">
        <div className="opacity-0 animate-fade-up">
          <Calendar
            selected={selectedDate}
            onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
            minDate={initDate()}
          />
        </div>

        {/* Time slot panel */}
        <div className="bg-white rounded-xl border border-surface-line p-6 w-80 max-w-full flex flex-col gap-4 opacity-0 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="text-center">
            <p className="text-mqd-title font-semibold">{formattedDate}</p>
            <p className="text-ink-muted text-xs mt-1">{durationLabel} blocks</p>
          </div>

          <div key={dateStr} className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1 animate-fade-scale">
            {loading || deskCount === null ? (
              <p className="text-center text-ink-muted text-sm py-6">Checking availability…</p>
            ) : error ? (
              <p className="text-center text-red-500 text-sm py-6">{error}</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-center text-ink-muted text-sm py-6">
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
            onClick={() => {
              if (!selectedSlot) return;
              const slot = `date=${dateStr}&startMin=${selectedSlot.startMin}&endMin=${selectedSlot.endMin}`;
              // Asking for any free desk skips the floor plan entirely — the
              // backend assigns one when the booking is submitted.
              navigate(
                searchParams.get('deskChoice') === 'auto'
                  ? `/request?${slot}&deskChoice=auto`
                  : `/desk-selection?${slot}&type=${searchParams.get('type') || 'hourly'}`
              );
            }}
            className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition mt-auto flex items-center justify-center gap-2"
          >
            Next Page
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Paired with Next rather than floating near the breadcrumb: the
              two navigation actions belong together, where attention already is. */}
          <div className="flex justify-center pt-1">
            <BackLink
              to={`/reservation?duration=${durationMins}&type=${searchParams.get('type') || 'hourly'}`
                + `&deskChoice=${searchParams.get('deskChoice') || 'pick'}`
                + `&startDate=${searchParams.get('startDate') || ''}`}
              label="Back"
            />
          </div>
        </div>
      </div>
    </>
  );
}
