import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, CheckCircle2, XCircle } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { getReservationByCode, ApiError } from '../api/client';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Confirmation Code', path: '/confirmation-code' },
];

const formatMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// 'expired' reads as jargon to someone checking a code, so it's phrased as
// what actually happened to them.
const STATUS_LABELS = {
  pending: 'Awaiting approval',
  approved: 'Confirmed',
  denied: 'Denied',
  expired: 'Not reviewed in time',
  canceled: 'Canceled',
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-700',
  canceled: 'bg-gray-200 text-gray-700',
};

export default function ConfirmationCodePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null); // null | 'found' | 'not-found' | 'error'
  const [booking, setBooking] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (searching) return;

    setSearching(true);
    setErrorMessage(null);

    try {
      const found = await getReservationByCode(code.trim());
      setBooking(found);
      setResult('found');
    } catch (err) {
      setBooking(null);
      // A 404 is an expected outcome here, not a failure worth alarming about.
      if (err instanceof ApiError && err.status === 404) {
        setResult('not-found');
      } else {
        setErrorMessage(err.message);
        setResult('error');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleCancel = () => {
    setCode('');
    setResult(null);
    setBooking(null);
    setErrorMessage(null);
  };

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-gray-50">
        <div className="w-full max-w-md flex flex-col gap-6 bg-white rounded-xl shadow-md border border-gray-100 p-8 opacity-0 animate-fade-up">

          <div className="text-center">
            <h1 className="text-mqd-title text-2xl font-bold">Confirmation Code</h1>
            <p className="text-gray-500 text-sm mt-1">
              Enter the confirmation code from your reservation email to view your booking.
            </p>
          </div>

          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <div>
              <label htmlFor="code" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Ticket className="w-4 h-4" />
                Confirmation Code
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setResult(null); }}
                placeholder="e.g. KS5CTVXU"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-700 text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!code.trim() || searching}
                className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-base transition"
              >
                {searching ? 'Looking up…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 bg-gray-900 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg text-base transition"
              >
                Cancel
              </button>
            </div>
          </form>

          {result === 'found' && booking && (
            <div className="flex flex-col items-center gap-2 text-center py-2 border-t border-gray-100 pt-5">
              <CheckCircle2 className="w-10 h-10 text-mqd-title" />
              <p className="text-mqd-title font-semibold">Reservation found</p>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-sm text-gray-700 w-full space-y-1 mt-2">
                <p><span className="font-semibold text-mqd-title">Name:</span> {booking.user}</p>
                <p><span className="font-semibold text-mqd-title">Desk:</span> Desk# {booking.deskNumber}</p>
                <p><span className="font-semibold text-mqd-title">Date:</span> {formatDate(booking.date)}</p>
                <p>
                  <span className="font-semibold text-mqd-title">Time:</span>{' '}
                  {formatMinutes(booking.startMin)} - {formatMinutes(booking.endMin)}
                </p>
                <p className="flex items-center gap-2 pt-1">
                  <span className="font-semibold text-mqd-title">Status:</span>
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLES[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[booking.status] || booking.status}
                  </span>
                </p>
              </div>
            </div>
          )}

          {result === 'not-found' && (
            <div className="flex flex-col items-center gap-2 text-center py-2 border-t border-gray-100 pt-5">
              <XCircle className="w-10 h-10 text-red-500" />
              <p className="text-red-500 font-semibold">No reservation found</p>
              <p className="text-gray-500 text-sm">Double-check your confirmation code and try again.</p>
            </div>
          )}

          {result === 'error' && (
            <div className="flex flex-col items-center gap-2 text-center py-2 border-t border-gray-100 pt-5">
              <XCircle className="w-10 h-10 text-amber-500" />
              <p className="text-amber-600 font-semibold">Couldn't complete the lookup</p>
              <p className="text-gray-500 text-sm">{errorMessage}</p>
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="text-mqd-btn hover:underline text-sm font-medium text-center"
          >
            ← Back to Landing
          </button>
        </div>
      </div>
    </>
  );
}
