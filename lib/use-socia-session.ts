'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { captchaGastado } from './auth/captcha-usado.ts';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useStudio } from '@/lib/studio-context';
import { mensajeSeguro } from '@/lib/errores';
import { sessionIdWidget } from './reservar/eventos.ts';

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

  // El ref se actualiza en un efecto, no en el cuerpo del render: escribir un
  // ref mientras se renderiza rompe si React descarta ese render. El
  // `useRef(...)` ya deja puesto el primer valor, y solo se lee dentro de
  // callbacks asíncronos posteriores al montaje.
  const { recargarPublico } = useStudio();
  const recargarRef = useRef(recargarPublico);
  useEffect(() => { recargarRef.current = recargarPublico; }, [recargarPublico]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Se suscribe a onAuthStateChange de Supabase. Sistema externo.
    resolver();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') resolver();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  // `sesionId` opcional: si la socia venía de pulsar "Reservar" en una clase
  // concreta, lo propagamos al enlace mágico (?sesion=…) para aterrizar directa
  // en la confirmación de ESA clase al volver del correo, sin re-buscarla.
  // Sin `sesionId` (acceso genérico, botón "Acceder" de la cabecera) se
  // propaga `?acceso=1` en su lugar — sin ESTO, volver del correo dejaba a la
  // socia en la página sin ninguna señal de si había entrado o no: tenía que
  // pulsar "Acceder" otra vez para que el modal reaccionara.
  const enviarEnlace = useCallback(async (email: string, sesionId?: string, captchaToken?: string): Promise<{ ok: true } | { error: string }> => {
    const base = sesionId ? `?sesion=${encodeURIComponent(sesionId)}` : '?acceso=1';
    // Fase 8 (CRO): propaga el sessionId ANÓNIMO (sessionStorage, no
    // identidad de socia — eventos.ts) al enlace mágico para poder medir
    // lead_completed al volver: es la única forma de emparejar "pidió el
    // enlace" con "lo abrió" cuando ambos ocurren en pestañas/sesiones de
    // navegador distintas (ver docs/cro-analytics-widget-diseno.md §1.1).
    const wsid = sessionIdWidget();
    const query = wsid ? `${base}&wsid=${encodeURIComponent(wsid)}` : base;
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/reservar/${slug}${query}`, captchaToken },
    });
    if (captchaToken) captchaGastado();
    // Mismo filtro que lib/portal-auth.tsx: Supabase a veces devuelve un
    // `message` que no es texto para una persona (p. ej. un "{}" en crudo
    // cuando el token de captcha ha caducado entre verificarlo y enviar).
    return error ? { error: mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, [slug]);

  // Login del día a día, sin depender de un viaje de email + almacenamiento de
  // tercero entre pestañas (frágil dentro de un <iframe> embebido en la web
  // del estudio — Safari/Chrome recortan cada vez más ese acceso). Mismo
  // patrón que lib/portal-auth.tsx (`loginConPassword`), mismo cliente
  // Supabase — la socia solo llega aquí tras haber creado su contraseña
  // (ver `establecerPassword` más abajo).
  const loginConPassword = useCallback(async (email: string, password: string, captchaToken?: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
    if (captchaToken) captchaGastado();
    if (!error) return { ok: true };
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return { error: 'Email o contraseña incorrectos.' };
    if (msg.includes('rate limit') || msg.includes('too many')) return { error: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' };
    return { error: mensajeSeguro(error.message, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.') };
  }, []);

  // Requiere una sesión de Supabase ya autenticada (por el magic link de
  // `enviarEnlace`, que ya probó que controla ese email) — esto solo fija la
  // contraseña sobre esa sesión, no es una prueba de identidad en sí misma.
  // Copia literal del mismo método en lib/portal-auth.tsx.
  const establecerPassword = useCallback(async (password: string): Promise<{ ok: true } | { error: string }> => {
    const { error } = await supabasePortal.auth.updateUser({ password });
    return error ? { error: mensajeSeguro(error.message, 'No se ha podido guardar la contraseña. Inténtalo de nuevo en unos segundos.') } : { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem('ps_portal_socia'); } catch { /* ignore */ }
    setSocia(null); setUsuarioEmail(null);
  }, []);

  return { socia, usuarioEmail, autenticado: !!usuarioEmail, isLoading, enviarEnlace, loginConPassword, establecerPassword, logout, refrescar: resolver };
}
