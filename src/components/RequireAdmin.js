import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentAdmin, getStoredToken, clearSession } from '../api/client';

// Gates the admin routes. This is a convenience, not the security boundary —
// every admin endpoint checks the token server side, so a user who bypasses
// this gets an empty dashboard and 401s rather than access.
export default function RequireAdmin({ children }) {
  const [state, setState] = useState(getStoredToken() ? 'checking' : 'denied');

  useEffect(() => {
    if (state !== 'checking') return undefined;
    let cancelled = false;

    // Confirm the stored token is still valid rather than letting the user
    // discover it expired when an action fails.
    getCurrentAdmin()
      .then((admin) => {
        if (cancelled) return;
        if (admin.role === 'admin') {
          setState('allowed');
        } else {
          clearSession();
          setState('denied');
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setState('denied');
      });

    return () => { cancelled = true; };
  }, [state]);

  if (state === 'checking') {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <p className="text-gray-500 text-sm">Checking your session…</p>
      </div>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
