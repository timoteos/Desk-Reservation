import { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import DeskMap, { DeskMapLegend } from './DeskMap';
import { getDeskStatus, claimDesk } from '../api/client';
import { formatMinutes, SLOT_MINUTES } from '../lib/officeHours';

// How often the floor refreshes. Desks change hands over minutes, not seconds,
// and this is twelve rows behind an index — cheap enough to do often, and a
// poll rather than a socket for the same reason the request queue polls: one
// query and ten milliseconds, against a persistent connection for whoever
// inherits this to operate.
const REFRESH_MS = 20000;

// The office floor as it stands, and a way to take a desk you are standing at.
//
// Deliberately carries no names. It is shown on a screen anybody can walk up
// to, and a map of who sits where would publish staff whereabouts to every
// visitor and contractor passing through.
export default function LiveFloor({ onClaimed }) {
  const [desks, setDesks] = useState(null);
  // The server's clock, not the browser's. A kiosk left running for months is
  // exactly the machine whose clock drifts, and the two disagreeing would offer
  // an end time the server then refuses.
  const [nowMin, setNowMin] = useState(null);
  const [endMin, setEndMin] = useState(null);
  const [lastOk, setLastOk] = useState(null);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getDeskStatus();
      setDesks(data.desks);
      setNowMin(data.nowMin);
      setLastOk(new Date());
      setStale(false);
    } catch {
      // Keep the last good floor rather than blanking it, but stop claiming it
      // is current. A screen confidently showing Free because the network died
      // is worse than one admitting it does not know.
      setStale(true);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  const chosen = desks?.find((d) => String(d.id) === String(selected));

  // Every half hour from the next boundary up to the point the desk stops being
  // free — the next booking, or the end of the day. Only the end is chosen; the
  // start is now, because the person is standing there.
  const endOptions = [];
  if (chosen && nowMin != null) {
    const first = Math.ceil((nowMin + 1) / SLOT_MINUTES) * SLOT_MINUTES;
    for (let m = first; m <= chosen.freeUntilMin; m += SLOT_MINUTES) endOptions.push(m);
    // A desk free for less than one slot is still worth taking for what is left.
    if (endOptions.length === 0) endOptions.push(chosen.freeUntilMin);
  }
  const effectiveEnd = endMin ?? endOptions[endOptions.length - 1];

  const claim = async (e) => {
    e.preventDefault();
    if (!chosen || !email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await claimDesk(chosen.number, {
        email: email.trim(),
        endMin: effectiveEnd,
      });
      setSelected(null);
      setEmail('');
      setEndMin(null);
      await load();
      onClaimed?.(booking);
    } catch (err) {
      setError(err.message);
      // The floor moved under us — whoever took it should now be visible.
      load();
    } finally {
      setBusy(false);
    }
  };

  const freeCount = desks?.filter((d) => d.status === 'free').length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-mqd-title font-semibold">
          {desks
            ? `${freeCount} of ${desks.length} desks free right now`
            : 'Loading the floor…'}
        </h2>
        {stale ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <WifiOff className="w-3.5 h-3.5" />
            Can&rsquo;t reach the system
            {lastOk && ` — last updated ${lastOk.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Updates every {REFRESH_MS / 1000} seconds</span>
        )}
      </div>

      <DeskMap
        desks={desks ?? []}
        loading={!desks}
        selectedDeskId={selected}
        onSelect={(desk) => {
          setSelected((current) => (String(current) === String(desk.id) ? null : desk.id));
          // A new desk has its own ceiling, so a leftover choice could exceed it.
          setEndMin(null);
          setError(null);
        }}
        compact
      />
      <DeskMapLegend live />

      {chosen ? (
        <form onSubmit={claim} className="bg-mqd-50 border border-mqd-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-ink-body text-sm">
            <span className="font-semibold text-mqd-title">Desk# {chosen.number}</span>{' '}
            — free until {formatMinutes(chosen.freeUntilMin)}
            {endOptions.length > 1 && endOptions[endOptions.length - 1] < 1020 && ', when it is booked'}.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-ink-body text-sm font-medium">Until when?</span>
            <select
              value={effectiveEnd ?? ''}
              onChange={(e) => setEndMin(Number(e.target.value))}
              className="border border-surface-line rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            >
              {endOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                  {m === endOptions[endOptions.length - 1] && endOptions.length > 1 ? ' — as long as it is free' : ''}
                </option>
              ))}
            </select>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="you@dhs.hawaii.gov"
            aria-label="Your email address"
            autoComplete="off"
            className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
          />
          {error && (
            <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!email.trim() || busy}
              className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition"
            >
              {busy ? 'Taking it…' : `Take it until ${formatMinutes(effectiveEnd)}`}
            </button>
            <button
              type="button"
              onClick={() => { setSelected(null); setEndMin(null); setError(null); }}
              className="border border-surface-line hover:bg-surface-panel text-ink-body font-semibold px-4 rounded-lg text-sm transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="text-ink-muted text-sm">
          {freeCount > 0
            ? 'No booking? Tap a green desk to take it for today.'
            : 'Every desk is taken at the moment. Ask the front desk.'}
        </p>
      )}
    </div>
  );
}
