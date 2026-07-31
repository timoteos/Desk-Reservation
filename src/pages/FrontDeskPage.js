import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, DoorOpen } from 'lucide-react';
import { checkIn } from '../api/client';
import { formatMinutes } from '../lib/officeHours';
import LiveFloor from '../components/LiveFloor';

// How long a result stays on screen before the page returns to the prompt.
// This is a shared screen in a lobby: the previous person's name and desk
// number must not still be there when the next one walks up.
const CLEAR_AFTER_MS = 12000;

// Longer when a confirmation code is on screen. Checking in only tells you a
// desk number you are about to walk to; claiming a desk hands you the only
// credential you will ever have for that booking, and twelve seconds is not
// long enough to write one down.
const CLEAR_WITH_CODE_MS = 45000;

// The front desk.
//
// A narrower sibling of the confirmation-code page. That one runs on your own
// device and lets you cancel; this one is a shared screen with somebody
// standing at it, so it deliberately cannot cancel anything and shows only
// today. On a shared surface, cancel is somebody else's booking one careless
// tap away.
//
// Nothing here needs a sign-in. The code is the credential, and it is the only
// one a sponsored visitor will ever have.
export default function FrontDeskPage() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { name, deskNumber, ... }
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const reset = () => {
    setResult(null);
    setError(null);
    setCode('');
    inputRef.current?.focus();
  };

  // Clear after a result, and cancel the timer on unmount so a pending clear
  // cannot fire into a page that has gone.
  useEffect(() => {
    if (!result && !error) return undefined;
    timerRef.current = setTimeout(
      reset,
      result?.confirmationCode ? CLEAR_WITH_CODE_MS : CLEAR_AFTER_MS
    );
    return () => clearTimeout(timerRef.current);
  }, [result, error]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const entered = code.trim().toUpperCase();
    if (!entered || busy) return;

    setBusy(true);
    setError(null);
    try {
      setResult(await checkIn(entered));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-10 bg-surface-page">
      <div className="w-full max-w-5xl">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {result ? (
          <div className="bg-white rounded-2xl shadow-modal p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-mqd-btn" />
            <p className="text-ink-muted text-sm">Checked in</p>
            <p className="text-3xl font-bold text-mqd-title">{result.name}</p>

            {/* The desk number is the one thing they came here to find out, so
                it is the largest thing on the screen. */}
            <div className="bg-mqd-50 border border-mqd-200 rounded-xl px-8 py-5 w-full">
              <p className="text-ink-muted text-xs uppercase tracking-wide">Your desk</p>
              <p className="text-5xl font-bold text-mqd-title leading-tight">
                Desk# {result.deskNumber}
              </p>
              <p className="text-ink-body text-sm mt-1">
                {formatMinutes(result.startMin)} – {formatMinutes(result.endMin)}
              </p>
            </div>

            {/* A walk-up is issued a code here and nowhere else — nothing emails
                it yet, so if this screen does not show it, the person leaves
                with a booking they can never look up. */}
            {result.confirmationCode && (
              <div className="w-full">
                <p className="text-ink-muted text-xs uppercase tracking-wide">Your confirmation code</p>
                <p className="font-mono text-2xl tracking-[0.25em] text-mqd-title select-all">
                  {result.confirmationCode}
                </p>
                <p className="text-ink-muted text-xs mt-1">
                  Write this down — it is how you check or change this booking.
                </p>
              </div>
            )}

            {result.reclaimed && (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm">
                This desk had been released because nobody had arrived. It is yours again.
              </p>
            )}

            <button
              onClick={reset}
              className="text-ink-muted hover:text-mqd-title text-sm font-medium underline underline-offset-4"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-modal p-8 flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <DoorOpen className="w-10 h-10 text-mqd-title" />
              <h1 className="text-2xl font-bold text-mqd-title">Check in</h1>
              <p className="text-ink-muted text-sm">
                Enter the confirmation code from your booking.
              </p>
            </div>

            <input
              ref={inputRef}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
              placeholder="e.g. KS5CTVXU"
              aria-label="Confirmation code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              maxLength={12}
              className="w-full text-center font-mono text-3xl tracking-[0.3em] uppercase
                         border-2 border-surface-line rounded-xl px-4 py-5
                         focus:outline-none focus:border-mqd-btn focus:ring-2 focus:ring-mqd-btn/30"
            />

            {error && (
              <p className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={!code.trim() || busy}
              className="bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed
                         text-white font-semibold text-lg py-4 rounded-xl transition"
            >
              {busy ? 'Checking in…' : 'Check in'}
            </button>

            <p className="text-ink-muted text-xs text-center">
              No code? The person at the front desk can look up your booking.
            </p>
          </form>
        )}

        {/* The floor, live. Somebody arriving without a booking has somewhere to
            go, and somebody who does have one can see they are heading to a desk
            that is actually theirs. */}
        <div className="bg-white rounded-2xl shadow-modal p-6">
          <LiveFloor onClaimed={setResult} />
        </div>
      </div>
      </div>
    </div>
  );
}
