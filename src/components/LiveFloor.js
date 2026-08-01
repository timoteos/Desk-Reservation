import { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import DeskMap, { DeskMapLegend } from './DeskMap';
import { getDeskStatus, claimDesk } from '../api/client';
import { formatMinutes, SLOT_MINUTES } from '../lib/officeHours';

// How often the floor refreshes.
//
// Polling rather than a socket, for the reason the request queue polls: one
// query and ten milliseconds, against a persistent connection for whoever
// inherits this to operate.
//
// Refreshing faster would not prevent a double booking, and it is worth being
// clear why. Nothing here decides whether a desk is free — the exclusion
// constraint does, at the moment of writing. A stale map costs a wasted tap and
// a clear refusal, never a desk given to two people. Even at one-second polling
// the gap between the last refresh and the tap would remain; only the database
// closes it, and it already does.
//
// So the interval is tuned for usefulness, not safety. Idle, twenty seconds is
// plenty for a screen somebody glances at. While a desk is selected and details
// are being typed is the one window where staleness is felt, so it tightens.
const REFRESH_MS = 20000;
const REFRESH_WHILE_CHOOSING_MS = 5000;

// The office floor as it stands, and a way to take a desk you are standing at.
//
// Deliberately carries no names. It is shown on a screen anybody can walk up
// to, and a map of who sits where would publish staff whereabouts to every
// visitor and contractor passing through.
export default function LiveFloor({ onClaimed, refreshKey = 0 }) {
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
  // Staff take a desk with their address alone. A visitor has no account, so
  // they give their details and name the person they are here to see — who is
  // recorded as sponsoring the visit. Sponsorship is not waived at the front
  // desk, it is asked for.
  const [who, setWho] = useState('staff');
  const [guest, setGuest] = useState({ firstName: '', lastName: '', email: '', organization: '' });
  const [hostEmail, setHostEmail] = useState('');
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

  // refreshKey re-reads on demand. Somebody checks in through the panel above,
  // their desk becomes occupied, and the map would otherwise go on saying every
  // desk is free for up to twenty seconds — a screen contradicting what the
  // person standing at it has just done.
  useEffect(() => {
    load();
    const every = selected ? REFRESH_WHILE_CHOOSING_MS : REFRESH_MS;
    timer.current = setInterval(load, every);
    return () => clearInterval(timer.current);
  }, [load, selected, refreshKey]);

  const chosen = desks?.find((d) => String(d.id) === String(selected));

  // The desk went while the form was open. Said plainly, rather than letting
  // somebody finish typing a visitor's details into a claim that cannot land.
  const takenWhileChoosing = Boolean(selected) && chosen && chosen.status !== 'free';

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
  // Clamped to what is still on offer. The options are derived from the
  // server's clock and shift every time it crosses a half hour, so a choice
  // made at 11:40 is no longer offered at 12:01 — and the visitor form takes
  // long enough to fill in that this is a normal occurrence, not an edge case.
  // Left alone, the select showed nothing matching and the form submitted a
  // dead value the server refused. The nearest end still available is taken
  // instead, and the button label says which.
  const effectiveEnd =
    endMin != null && endOptions.includes(endMin)
      ? endMin
      : endOptions.find((m) => endMin != null && m >= endMin)
        ?? endOptions[endOptions.length - 1];

  const guestReady =
    guest.firstName.trim() && guest.lastName.trim() && guest.email.trim() && hostEmail.trim();
  const ready =
    !takenWhileChoosing &&
    (who === 'staff' ? Boolean(email.trim()) : Boolean(guestReady));

  const resetForm = () => {
    setSelected(null);
    setEmail('');
    setGuest({ firstName: '', lastName: '', email: '', organization: '' });
    setHostEmail('');
    setEndMin(null);
  };

  const claim = async (e) => {
    e.preventDefault();
    if (!chosen || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await claimDesk(chosen.number, {
        ...(who === 'staff'
          ? { email: email.trim() }
          : {
              guest: {
                firstName: guest.firstName.trim(),
                lastName: guest.lastName.trim(),
                email: guest.email.trim(),
                organization: guest.organization.trim() || undefined,
              },
              hostEmail: hostEmail.trim(),
            }),
        endMin: effectiveEnd,
      });
      resetForm();
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
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-mqd-title font-semibold text-lg">
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

      <div className="flex-1 min-h-0 flex flex-col justify-center">
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
      </div>
      <DeskMapLegend live />

      <p className={`text-sm rounded-lg px-3 py-2.5 shrink-0 ${
        freeCount > 0
          ? 'bg-mqd-50 border border-mqd-200 text-ink-body'
          : 'bg-amber-50 border border-amber-200 text-amber-900'
      }`}>
        {freeCount > 0
          ? 'No booking? Tap any green desk to take it for today.'
          : 'Every desk is taken at the moment. Ask the person at the front desk.'}
      </p>

      {/* A layer rather than a section. Inline, this form pushed the page past
          the height of a landscape iPad and the submit button ended up behind a
          scroll on a screen somebody is standing at. */}
      {chosen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => { resetForm(); setError(null); }}
          role="presentation"
        >
        <form
          onSubmit={claim}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Take Desk# ${chosen.number}`}
          className="bg-white rounded-2xl shadow-modal p-5 md:p-6 w-full max-w-lg
                     flex flex-col gap-3 max-h-full overflow-y-auto"
        >
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
          <div className="flex gap-2" role="group" aria-label="Who is taking this desk">
            {[
              { key: 'staff', label: 'MQD staff' },
              { key: 'visitor', label: 'A visitor' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => { setWho(o.key); setError(null); }}
                aria-pressed={who === o.key}
                className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border transition
                  ${who === o.key
                    ? 'bg-mqd-btn text-white border-mqd-btn'
                    : 'border-surface-line bg-white text-ink-body hover:bg-surface-panel'}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {who === 'staff' ? (
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@dhs.hawaii.gov"
              aria-label="Your email address"
              autoComplete="off"
              className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
            />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Visitor first name" placeholder="First name"
                  value={guest.firstName}
                  onChange={(e) => { setGuest((g) => ({ ...g, firstName: e.target.value })); setError(null); }}
                  className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
                <input
                  aria-label="Visitor last name" placeholder="Last name"
                  value={guest.lastName}
                  onChange={(e) => { setGuest((g) => ({ ...g, lastName: e.target.value })); setError(null); }}
                  className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </div>
              {/* Paired, so the visitor form costs four rows rather than five.
                  On a screen somebody is standing at, a field below the fold is
                  a field that gets missed. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="email" aria-label="Visitor email" placeholder="visitor@example.com"
                  value={guest.email}
                  onChange={(e) => { setGuest((g) => ({ ...g, email: e.target.value })); setError(null); }}
                  className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
                <input
                  aria-label="Visitor company" placeholder="Company (optional)"
                  value={guest.organization}
                  onChange={(e) => setGuest((g) => ({ ...g, organization: e.target.value }))}
                  className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
              </div>
              <input
                type="email" aria-label="Who they are here to see"
                placeholder="Who are you here to see? their@dhs.hawaii.gov"
                value={hostEmail}
                onChange={(e) => { setHostEmail(e.target.value); setError(null); }}
                className="border border-surface-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              />
              <p className="text-ink-muted text-xs -mt-0.5">
                They are recorded as sponsoring this visit, and answer for the desk
                while it is held.
              </p>
            </div>
          )}
          {takenWhileChoosing && (
            <p className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-sm">
              Somebody took Desk# {chosen.number} while you were filling this in. Pick another.
            </p>
          )}

          {error && (
            <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!ready || busy}
              className="flex-1 bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition"
            >
              {busy ? 'Taking it…' : `Take it until ${formatMinutes(effectiveEnd)}`}
            </button>
            <button
              type="button"
              onClick={() => { resetForm(); setError(null); }}
              className="border border-surface-line hover:bg-surface-panel text-ink-body font-semibold px-5 py-2.5 rounded-lg text-sm transition"
            >
              Cancel
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
}
