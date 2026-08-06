import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, DoorOpen } from 'lucide-react';
import Clock from '../components/Clock';
import { checkIn } from '../api/client';
import { formatMinutes } from '../lib/officeHours';
import LiveFloor from '../components/LiveFloor';
import { resourceLabel } from '../lib/resourceLabel';

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
// One column, ordered by likelihood: most people walking up already have a
// booking, so checking in is the first thing on the screen and costs one row.
// The floor plan sits under it with the full width of the page, which is the
// widest it can be — it is an image with a fixed aspect ratio, so width is the
// only thing that makes it bigger.
//
// Anything that grows — the claim form, the result — is a layer over the page
// rather than a section within it. On a landscape iPad there are about ninety
// pixels left under the map and the visitor form needs three hundred and
// thirty, so an inline form could only fit by shrinking the map to nothing. A
// dialog keeps the page one screen tall and never scrolling.
//
// It remains a narrower sibling of the confirmation-code page: this one is a
// shared screen with somebody standing at it, so it cannot cancel anything and
// shows only today. Nothing here needs a sign-in — the code is the credential,
// and it is the only one a sponsored visitor will ever have.
export default function FrontDeskPage() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Bumped when a check-in lands, so the floor below re-reads at once rather
  // than insisting the desk is free until its next poll.
  const [floorKey, setFloorKey] = useState(0);
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
      setFloorKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface-page px-3 md:px-5 py-3 md:py-4 gap-3 min-h-0">

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold text-mqd-title">
          Welcome — check in or take a desk
        </h1>
        <Clock />
      </div>

      {/* One row, because checking in is one field and a button. It was a card
          as tall as the floor plan beside it, which stranded a column of empty
          space every time the map grew and the card could not. */}
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-modal px-4 py-3 flex items-center gap-3 flex-wrap md:flex-nowrap shrink-0"
      >
        <div className="flex items-center gap-2.5 shrink-0">
          <DoorOpen className="w-6 h-6 text-mqd-title" />
          <div className="leading-tight">
            <p className="font-bold text-mqd-title">Already booked?</p>
            <p className="text-ink-muted text-xs">Enter your confirmation code.</p>
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
          className="flex-1 min-w-[10rem] text-center font-mono text-xl md:text-2xl tracking-[0.2em] uppercase
                     border-2 border-surface-line rounded-lg px-3 py-2.5
                     placeholder:font-sans placeholder:text-sm placeholder:tracking-normal
                     placeholder:normal-case placeholder:text-ink-muted
                     focus:outline-none focus:border-mqd-btn focus:ring-2 focus:ring-mqd-btn/30"
        />

        <button
          type="submit"
          disabled={!code.trim() || busy}
          className="shrink-0 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed
                     text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          {busy ? 'Checking in…' : 'Check in'}
        </button>
      </form>

      {error && (
        <p className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm shrink-0">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {/* The floor gets the whole width and whatever height is left. */}
      <div className="bg-white rounded-xl shadow-modal p-3 md:p-4 flex-1 min-h-0 flex">
        <LiveFloor onClaimed={setResult} refreshKey={floorKey} />
      </div>

      {result && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={reset}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Checked in"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-modal p-6 md:p-8 w-full max-w-md
                       flex flex-col items-center gap-3 text-center max-h-full overflow-y-auto"
          >
            <CheckCircle2 className="w-14 h-14 text-mqd-btn" />
            <p className="text-ink-muted text-sm">Checked in</p>
            <p className="text-2xl md:text-3xl font-bold text-mqd-title">{result.name}</p>

            {/* The desk number is the one thing they came here to find out, so
                it is the largest thing on the screen. */}
            <div className="bg-mqd-50 border border-mqd-200 rounded-xl px-6 py-4 w-full">
              <p className="text-ink-muted text-xs uppercase tracking-wide">Your desk</p>
              <p className="text-5xl font-bold text-mqd-title leading-tight">
                {resourceLabel(result)}
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
              className="mt-1 bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold px-8 py-2.5 rounded-lg transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
