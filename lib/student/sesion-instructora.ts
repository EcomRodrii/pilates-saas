'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { CacheSesion, claveSesion } from '@/lib/widget/sesion-cache';
import { invitacionDeLaCuenta, olvidarInvitacionApp } from '@/lib/student/invitacion-app';

// ¿La cuenta que ha entrado en la app es instructora de ESTE estudio?
//
// Hermano de `useSesionStudent` (lib/student/sesion.ts), con su misma caché de
// un solo vuelo: la guardia, el inicio y la pantalla comparten la petición.
//
// ⚠️ COSTE para las alumnas. El inicio lo pregunta a toda cuenta que entra, y
// casi ninguna es instructora. Para no pagar una petición en cada apertura de la
// app, el «no lo es» se recuerda 12 h en `localStorage` por (estudio, usuario).
// El precio: una alumna a la que el estudio invite como instructora puede tardar
// hasta 12 h en ver su parte si no vuelve a entrar. Quien viene del enlace de
// invitación sí la ve al momento: `acceso/verificar` pregunta con `forzar`.
// Un fallo de red NO se recuerda: no convierte a nadie en alumna.

export interface InstructoraSesion {
  instructorId: string;
  nombre: string;
  fotoUrl: string | null;
}

const cacheInstructora = new CacheSesion<InstructoraSesion | null>(5 * 60_000);
const NO_ES_TTL_MS = 12 * 60 * 60_000;
const claveNoEs = (slug: string, userId: string) => `st_no_instructora:${slug}:${userId}`;

function noEsReciente(slug: string, userId: string): boolean {
  try {
    const v = localStorage.getItem(claveNoEs(slug, userId));
    return v != null && Date.now() - Number(v) < NO_ES_TTL_MS;
  } catch {
    return false;
  }
}

function recordarNoEs(slug: string, userId: string, noEs: boolean): void {
  try {
    if (noEs) localStorage.setItem(claveNoEs(slug, userId), String(Date.now()));
    else localStorage.removeItem(claveNoEs(slug, userId));
  } catch {
    // Sin almacenamiento (modo privado): se pregunta cada vez, nada más.
  }
}

// ── Instructora o alumna (decisión del fundador, 15-sep-2026) ────────────────
//
// La propietaria da de alta a una instructora con su correo. Cuando ella entra
// en la app con ese correo, elige: entrar como instructora (une su cuenta a la
// ficha) o como alumna (alta de alumna normal). Antes la app la daba de alta
// como alumna sin preguntar.

const claveEligioAlumna = (slug: string, userId: string) => `st_eligio_alumna:${slug}:${userId}`;

/**
 * Ya eligió «alumna» en este dispositivo: no se le vuelve a preguntar. Si más
 * adelante quiere su parte de instructora, le vale el enlace de invitación.
 */
export function eligioEntrarComoAlumna(slug: string, userId: string): boolean {
  try { return localStorage.getItem(claveEligioAlumna(slug, userId)) != null; } catch { return false; }
}

export async function recordarEleccionAlumna(slug: string): Promise<void> {
  // Eligió alumna: la invitación guardada ya no pinta nada en este dispositivo.
  olvidarInvitacionApp(slug);
  const { data: { session } } = await supabasePortal.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  try { localStorage.setItem(claveEligioAlumna(slug, userId), String(Date.now())); } catch { /* modo privado */ }
}

/**
 * ¿Hay una invitación de equipo guardada para la cuenta que ha entrado? Sin
 * petición: solo el almacén del dispositivo, atado a esta cuenta.
 */
export async function hayInvitacionParaEstaSesion(slug: string): Promise<boolean> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  const userId = session?.user?.id;
  return Boolean(userId && invitacionDeLaCuenta(slug, userId));
}

// Un vuelo por (estudio, usuario) durante un minuto: `verificar` y la guardia
// preguntan casi a la vez al aterrizar.
const consultasEleccion = new Map<string, { en: number; valor: Promise<boolean> }>();

/**
 * ¿Hay que preguntarle si entra como instructora o como alumna? Sí cuando el
 * estudio la tiene dada de alta como instructora con su correo, todavía no ha
 * entrado como tal y no ha elegido ya «alumna».
 *
 * Sin el «no» recordado 12 h de `useSesionInstructora` a propósito: la dejaría
 * dándose de alta como alumna. Un fallo cuenta como «no», y no pasa nada: el
 * alta de alumna hace la misma comprobación en el servidor
 * (`/api/public/socio`, `INVITACION_INSTRUCTORA`).
 */
export async function debeElegirComoEntrar(slug: string): Promise<boolean> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  const userId = session?.user?.id;
  if (!session?.access_token || !userId) return false;
  // Viene del correo de invitación: se le pregunta, aunque antes eligiera alumna.
  if (invitacionDeLaCuenta(slug, userId)) return true;
  if (eligioEntrarComoAlumna(slug, userId)) return false;

  const clave = `${slug}:${userId}`;
  const previa = consultasEleccion.get(clave);
  if (previa && Date.now() - previa.en < 60_000) return previa.valor;

  const token = session.access_token;
  const valor = (async () => {
    try {
      const res = await fetch('/api/portal/instructora/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug }),
      });
      if (res.status !== 404) return false;
      const cuerpo = await res.json().catch(() => null) as { invitacionPendiente?: unknown } | null;
      return cuerpo?.invitacionPendiente === true;
    } catch {
      return false;
    }
  })();
  consultasEleccion.set(clave, { en: Date.now(), valor });
  return valor;
}

/**
 * «Entrar como instructora»: une su cuenta a la ficha que le creó el estudio.
 * Con el enlace de invitación guardado, por él; si no, por su correo.
 */
export async function unirseComoInstructora(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  const userId = session?.user?.id;
  if (!session?.access_token || !userId) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const enlace = invitacionDeLaCuenta(slug, userId);
  try {
    const res = await fetch('/api/portal/instructora/unirse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(enlace ? { slug, token: enlace } : { slug }),
    });
    const cuerpo = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !cuerpo?.ok) {
      // Un enlace que el servidor rechaza no se reintenta solo: fuera, para que
      // no la vuelva a traer aquí cada vez que entre.
      if (enlace && [400, 404, 409].includes(res.status)) olvidarInvitacionApp(slug);
      return { ok: false, error: cuerpo?.error || 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.' };
    }
    olvidarInvitacionApp(slug);
    // Lo que se sabía de ella («no es instructora») ya no vale.
    cacheInstructora.vaciar();
    consultasEleccion.clear();
    recordarNoEs(slug, userId, false);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión. Vuelve a intentarlo cuando tengas cobertura.' };
  }
}

/**
 * @param activo  `false` = no preguntar (p. ej. mientras no hay sesión).
 * @param forzar  ignora lo recordado: para quien acaba de entrar por un enlace.
 */
export function useSesionInstructora(slug: string, activo = true, forzar = false) {
  const [resuelto, setResuelto] = useState<{ slug: string; valor: InstructoraSesion | null } | null>(null);

  const resolver = useCallback(async (forzarAhora: boolean, ignorarMemoria = false) => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    const userId = sb?.user?.id;
    if (!sb?.access_token || !userId) { setResuelto({ slug, valor: null }); return; }
    if (!forzarAhora && noEsReciente(slug, userId)) { setResuelto({ slug, valor: null }); return; }
    const token = sb.access_token;
    const clave = claveSesion('', slug, userId);
    // ⚠️ Rendimiento (15-sep-2026): `forzar` lo pasan la guardia y TODAS las
    // pantallas de la instructora, así que se saltaba la caché en cada cambio de
    // pestaña — medido en producción, una petición de ~400 ms por navegación
    // antes de pintar nada. Ahora `forzar` sigue ignorando el «NO es
    // instructora» recordado (localStorage y memoria: por eso existe), pero
    // reutiliza un «SÍ lo es» confirmado en esta pestaña hace menos de 5 min.
    // Una baja en ese rato no abre nada: cada ruta `/api/portal/instructora/**`
    // vuelve a verificar y responde 401. `refrescar()` sí pregunta siempre.
    const guardada = cacheInstructora.guardado.get(clave);
    const reutilizar = !ignorarMemoria && guardada?.valor != null && Date.now() - guardada.cuando < cacheInstructora.ttlMs;
    try {
      const valor = await cacheInstructora.obtener(clave, async () => {
        const res = await fetch('/api/portal/instructora/sesion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug }),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`instructora/sesion ${res.status}`);
        const cuerpo = await res.json() as { instructora?: InstructoraSesion | null };
        return cuerpo.instructora ?? null;
      }, Date.now(), forzarAhora && !reutilizar);
      recordarNoEs(slug, userId, valor === null);
      setResuelto({ slug, valor });
    } catch {
      setResuelto({ slug, valor: null });
    }
  }, [slug]);

  useEffect(() => {
    if (!activo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Se suscribe a onAuthStateChange de Supabase. Sistema externo.
    resolver(forzar);
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { cacheInstructora.vaciar(); resolver(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, [activo, forzar, resolver]);

  const refrescar = useCallback(() => resolver(true, true), [resolver]);
  const listo = resuelto?.slug === slug;
  return {
    instructora: activo && listo ? resuelto.valor : null,
    isLoading: activo && !listo,
    refrescar,
  };
}
