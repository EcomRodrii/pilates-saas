'use client';

import { createContext, useContext, useState, useEffect } from 'react';

export interface PortalSession {
  socioId: string;
  nombre: string;
  email: string;
}

interface PortalAuthContextValue {
  session: PortalSession | null;
  isLoading: boolean;
  login: (s: PortalSession) => void;
  logout: () => void;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ps_portal_session');
      if (raw) setSession(JSON.parse(raw));
    } catch {}
    setIsLoading(false);
  }, []);

  function login(s: PortalSession) {
    setSession(s);
    localStorage.setItem('ps_portal_session', JSON.stringify(s));
  }

  function logout() {
    setSession(null);
    localStorage.removeItem('ps_portal_session');
  }

  return (
    <PortalAuthContext.Provider value={{ session, isLoading, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside PortalAuthProvider');
  return ctx;
}
