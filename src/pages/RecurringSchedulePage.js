import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  { label: 'Recurring Schedule', path: '/recurring-schedule' },
];

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
];

const OFFICE_START = '08:00';
const OFFICE_END = '16:30';

export default function RecurringSchedulePage() {
  const navigate = useNavigate();
  // Map of dayKey -> { start, end } for every day the user has selected
  const [schedule, setSchedule] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const toggleDay = (key) => {
    setSchedule((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { start: OFFICE_START, end: OFFICE_END };
      }
      return next;
    });
  };

  const updateDayTime = (key, field, value) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const selectedKeys = Object.keys(schedule);
  const allValid = selectedKeys.every((key) => schedule[key].start < schedule[key].end);
  const canSubmit = selectedKeys.length > 0 && allValid;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitted(true);
  };

  const selectedDays = DAYS.filter((d) => schedule[d.key]);

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-gray-50">
        <div className="w-full max-w-lg flex flex-col gap-6 bg-white rounded-xl shadow-md border border-gray-100 p-8 opacity-0 animate-fade-up">

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-mqd-title/10 flex items-center justify-center shrink-0">
              <RotateCcw className="w-6 h-6 text-mqd-title" />
            </div>
            <div>
              <h1 className="text-mqd-title text-2xl font-bold">Recurring Schedule</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Pick your days and set a different time for each one — great for half days.
              </p>
            </div>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-2 text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-mqd-title" />
              <p className="text-mqd-title font-semibold">Recurring schedule requested</p>
              <div className="text-gray-500 text-sm w-full space-y-1 mt-2">
                {selectedDays.map((d) => (
                  <p key={d.key}>
                    <span className="font-medium text-gray-700">{d.label}:</span>{' '}
                    {schedule[d.key].start} - {schedule[d.key].end}
                  </p>
                ))}
              </div>
              <button
                onClick={() => navigate('/reservation')}
                className="mt-4 text-mqd-btn hover:underline text-sm font-medium"
              >
                ← Back to Reservation
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Day selection */}
              <div>
                <p className="text-gray-700 font-medium mb-2">Days of the week</p>
                <div className="grid grid-cols-5 gap-2">
                  {DAYS.map((day) => {
                    const isSelected = !!schedule[day.key];
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        className={`py-3 rounded-lg text-xs sm:text-sm font-semibold border transition
                          ${isSelected
                            ? 'bg-mqd-btn text-white border-mqd-btn'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-day time ranges */}
              {selectedDays.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-gray-700 font-medium -mb-1">Time per day</p>
                  {selectedDays.map((day) => {
                    const { start, end } = schedule[day.key];
                    const isValid = start < end;
                    return (
                      <div key={day.key} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <span className="text-gray-700 font-medium text-sm sm:w-24 shrink-0">{day.label}</span>
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              value={start}
                              min={OFFICE_START}
                              max={OFFICE_END}
                              onChange={(e) => updateDayTime(day.key, 'start', e.target.value)}
                              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            />
                            <span className="text-gray-400 text-sm shrink-0">to</span>
                            <input
                              type="time"
                              value={end}
                              min={OFFICE_START}
                              max={OFFICE_END}
                              onChange={(e) => updateDayTime(day.key, 'end', e.target.value)}
                              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                            />
                          </div>
                        </div>
                        {!isValid && (
                          <p className="text-red-500 text-xs mt-2">End time must be after start time.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-gray-400 text-xs -mt-2">
                Office hours are 8:00 AM – 4:30 PM, Monday through Friday.
              </p>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-lg text-base transition"
              >
                Set Up Recurring Schedule
              </button>
            </form>
          )}

        </div>
      </div>
    </>
  );
}
