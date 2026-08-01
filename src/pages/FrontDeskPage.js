import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, DoorOpen } from 'lucide-react';
import Clock from '../components/Clock';
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
    <div className="flex-1 flex flex-col bg-surface-page px-4 md:px-6 py-5">
      {/* `m-auto` rather than `justify-center` on the parent. Both centre while
          the content fits, but justify-center clips at *both* ends once it does
          not — and the visitor form, which is four fields taller, does not.
          Auto margins collapse instead, so the overflow stays reachable. */}
      <div className="w-full max-w-[92rem] mx-auto m-auto flex flex-col gap-4">

      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold text-mqd-title">
          Welcome — check in or take a desk
        </h1>
        <Clock />
      </div>

      {/* The floor plan is what somebody reads from a few paces away, so it
          takes the room. Check-in is a panel beside it rather than an equal
          half: it is a short interaction with a keyboard, not something to
          look at. */}
      {/* Centred rather than stretched. The floor plan is an image with a fixed
          aspect ratio, so it is bound by the width of its column and cannot grow
          into extra height — stretching the card only opened a white void
          beneath it. Even space above and below reads as a choice; a void
          inside a card reads as a bug. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.6fr)_minmax(20rem,1fr)] gap-5 items-start">

        <div className="order-2 lg:order-1 bg-white rounded-2xl shadow-modal p-5 md:p-6 flex">
          <LiveFloor onClaimed={setResult} />
        </div>

        <div className="order-1 lg:order-2 flex flex-col">
        {result ? (
          <div className="bg-white rounded-2xl shadow-modal p-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-14 h-14 text-mqd-btn" />
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
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-modal p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <DoorOpen className="w-8 h-8 text-mqd-title shrink-0" />
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-mqd-title leading-tight">Already booked?</h2>
                <p className="text-ink-muted text-sm">Enter your confirmation code.</p>
              </div>
            </div>

            <input
              ref={inputRef}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
              placeholder="8 characters"
              aria-label="Confirmation code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              maxLength={12}
              className="w-full text-center font-mono text-2xl md:text-3xl tracking-[0.25em] uppercase
                         border-2 border-surface-line rounded-xl px-3 py-4
                         placeholder:font-sans placeholder:text-base placeholder:tracking-normal
                         placeholder:normal-case placeholder:text-ink-muted
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

        </div>
      </div>
      </div>
    </div>
  );
}
