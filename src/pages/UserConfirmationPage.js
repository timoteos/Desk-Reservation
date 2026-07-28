import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2 } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { createReservation } from '../api/client';

// Desk Selection is omitted when the desk was assigned automatically, since
// the user never passed through that step.
const crumbsFor = (autoAssign) => [
  { label: 'Landing', path: '/' },
  { label: 'Reservation', path: '/reservation' },
  ...(autoAssign ? [] : [{ label: 'Desk Selection', path: '/desk-selection' }]),
  { label: 'User Confirmation', path: '/request' },
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

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function UserConfirmationPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const deskId = searchParams.get('deskId');
  const deskNumber = searchParams.get('deskNumber');
  const autoAssign = searchParams.get('deskChoice') === 'auto';
  const dateStr = searchParams.get('date') || '';
  const startMin = parseInt(searchParams.get('startMin') || '480', 10);
  const endMin = parseInt(searchParams.get('endMin') || '540', 10);

  const dateLabel = formatDate(dateStr);
  const timeLabel = `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email) || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const reservation = await createReservation({
        email: email.trim(),
        // Omitting deskId asks the backend to assign any free desk.
        ...(autoAssign ? {} : { deskId: Number(deskId) }),
        date: dateStr,
        startMin,
        endMin,
      });
      setConfirmation(reservation);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Breadcrumb crumbs={crumbsFor(autoAssign)} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-gray-50">
        <div className="w-full max-w-lg flex flex-col gap-6 bg-white rounded-xl shadow-md border border-gray-100 p-8 opacity-0 animate-fade-up">

          <div className="text-center">
            <h1 className="text-mqd-title text-2xl font-bold">Confirm Your Reservation</h1>
            <p className="text-gray-500 text-sm mt-1">Review the details below and enter your email to request this desk.</p>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-lg p-5 text-center text-sm text-gray-700 space-y-1">
            <p>
              <span className="font-semibold text-mqd-title">Desk:</span>{' '}
              {confirmation
                ? `Desk# ${confirmation.deskNumber}`
                : autoAssign
                  ? 'Assigned automatically'
                  : `Desk# ${deskNumber}`}
            </p>
            <p><span className="font-semibold text-mqd-title">Location:</span> MQD System Office</p>
            <p>
              <span className="font-semibold text-mqd-title">Date & Time:</span>{' '}
              {dateLabel} - {dateLabel} &nbsp; {timeLabel}
            </p>
          </div>

          {confirmation ? (
            <div className="flex flex-col items-center gap-3 text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-mqd-title" />
              <p className="text-mqd-title font-semibold">Request submitted</p>
              <p className="text-gray-500 text-sm">
                An administrator will review it. Requests not reviewed within 24
                hours are released so the desk doesn't stay held.
              </p>
              <div className="bg-mqd-btn/10 border border-mqd-btn/20 rounded-lg px-6 py-4 w-full">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Confirmation code</p>
                <p className="text-mqd-title text-2xl font-bold tracking-[0.15em] font-mono">
                  {confirmation.confirmationCode}
                </p>
              </div>
              <p className="text-gray-500 text-sm">
                Keep this code — you can use it to look up your reservation.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dhs.hawaii.gov"
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </div>

              {error && (
                <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!isValidEmail(email) || submitting}
                className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-lg text-base transition"
              >
                {submitting ? 'Confirming…' : 'Confirm and Request'}
              </button>
            </form>
          )}

        </div>
      </div>
    </>
  );
}
