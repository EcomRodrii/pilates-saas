'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabasePortal } from '@/lib/supabase-portal';
import { useStudio } from '@/lib/studio-context';

export interface PortalSession {
  socioId: string;
  nombre: string;
  email: string;
}

interface PortalAuthContextValue {
  session: PortalSession | null;
  isLoading: boolean;
  // Envía el magic link / OTP al email. La sesión NO se establece aquí, sino
  // cuando la socia abre el enlace y vuelve al portal (onAuthStateChange).
  enviarEnlace: (email: string) => Promise<{ ok: true } | { error: string }>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

// El resto de la app aún identifica a la socia leyendo esta clave
// (api-client.leerSociaLocal → studio-context.cargarPublico). En este paso la
// escribimos SOLO tras una sesión de Supabase verificada (antes se escribía con
// solo teclear un email). El paso 2c la sustituirá por el Bearer del JWT.
const LEGACY_KEY = 'ps_portal_session';

export function PortalAuthProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // recargarPublico cambia de identidad en cada render (el contexto no memoiza);
  // lo guardamos en un ref para llamarlo sin meterlo en dependencias del efecto.
  const { recargarPublico } = useStudio();
  const recargarRef = useRef(recargarPublico);
  recargarRef.current = recargarPublico;

  const resolver = useCallback(async () => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    if (!sb?.access_token) {
      setSession(null);
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sb.access_token}` },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        // Autenticada en Supabase pero su email no es socia de este estudio.
        setSession(null);
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
        setIsLoading(false);
        return;
      }
      const data = await res.json() as PortalSession;
      setSession(data);
      try { localStorage.setItem(LEGACY_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      setIsLoading(false);
      recargarRef.current?.();
    } catch {
      setSession(null);
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    resolver(); // carga inicial (sesión ya existente o retorno del magic link)
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        resolver();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  const enviarEnlace = useCallback(async (email: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal/${slug}` },
    });
    return error ? { error: error.message } : { ok: true };
  }, [slug]);

  const logout = useCallback(async () => {
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    setSession(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ session, isLoading, enviarEnlace, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside PortalAuthProvider');
  return ctx;
}
