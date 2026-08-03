import { useState, useEffect } from 'react';

// The time, on a screen that claims to show the floor as it stands.
//
// A reception display quietly asserts that what it shows is current. A visible
// clock is how somebody checks that claim at a glance: a frozen one is the
// first sign the screen has stopped talking to anything, which is otherwise
// only discoverable by noticing a desk that should have changed and hasn't.
export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-right">
      <p
        className="text-2xl md:text-3xl font-semibold text-mqd-title tabular-nums leading-none"
        aria-label={`The time is ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
      >
        {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="text-ink-muted text-sm mt-0.5">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
