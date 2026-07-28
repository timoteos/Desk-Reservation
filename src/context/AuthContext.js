import { createContext, useContext, useState, useCallback } from 'react';
import { storeSession, clearSession } from '../api/client';

const ADMIN_KEY = 'mqd.admin';

const AuthContext = createContext(null);

const readStoredAdmin = () => {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null');
  } catch {
    return null;
  }
};

// Holds the signed-in admin so the header can react to sign in and out without
// a page reload. This is display state only — every admin endpoint verifies the
// token server side, so clearing it locally grants nothing.
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(readStoredAdmin);

  const signIn = useCallback((token, user) => {
    storeSession(token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(user));
    setAdmin(user);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setAdmin(null);
  }, []);

  return (
    <AuthContext.Provider value={{ admin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
