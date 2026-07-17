'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useStudio } from '@/lib/studio-context';

export interface SociaSesion {
  socioId: string;
  nombre: string;
  email: string;
}

// Sesión de socia para páginas públicas SIN el provider del portal (p. ej.
// /reservar). Usa el mismo cliente Supabase del portal (magic link) y resuelve
// la socia vía /api/public/session con el JWT verificado. Expone además
// `usuarioEmail`: autenticada aunque todavía NO sea socia del estudio (walk-in
// que se registrará al reservar).
export function useSociaSession(slug: string) {
  const [socia, setSocia] = useState<SociaSesion | null>(null);
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { recargarPublico } = useStudio();
  const recargarRef = useRef(recargarPublico);
  recargarRef.current = recargarPublico;

  const resolver = useCallback(async () => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    if (!sb?.access_token) {
      setSocia(null); setUsuarioEmail(null); setIsLoading(false);
      try { localStorage.removeItem('ps_portal_socia'); } catch { /* ignore */ }
      return;
    }
    setUsuarioEmail(sb.user?.email ?? null);
    try {
      const res = await fetch('/api/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sb.access_token}` },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) {
        const data = await res.json() as SociaSesion;
        setSocia(data);
        try { localStorage.setItem('ps_portal_socia', JSON.stringify(data)); } catch { /* ignore */ }
        setIsLoading(false);
        recargarRef.current?.();
      } else {
        // Autenticada pero aún no es socia de este estudio (walk-in).
        setSocia(null);
        try { localStorage.removeItem('ps_portal_socia'); } catch { /* ignore */ }
        setIsLoading(false);
      }
    } catch {
      setSocia(null); setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    resolver();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') resolver();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  // `sesionId` opcional: si la socia venía de pulsar "Reservar" en una clase
  // concreta, lo propagamos al enlace mágico (?sesion=…) para aterrizar directa
  // en la confirmación de ESA clase al volver del correo, sin re-buscarla.
  const enviarEnlace = useCallback(async (email: string, sesionId?: string): Promise<{ ok: true } | { error: string }> => {
    const query = sesionId ? `?sesion=${encodeURIComponent(sesionId)}` : '';
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/reservar/${slug}${query}` },
    });
    return error ? { error: error.message } : { ok: true };
  }, [slug]);

  const logout = useCallback(async () => {
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem('ps_portal_socia'); } catch { /* ignore */ }
    setSocia(null); setUsuarioEmail(null);
  }, []);

  return { socia, usuarioEmail, autenticado: !!usuarioEmail, isLoading, enviarEnlace, logout, refrescar: resolver };
}
