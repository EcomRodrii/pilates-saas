import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { SociaSesion } from '@/lib/use-socia-session';
import { CacheSesion, claveSesion } from './sesion-cache';
import { pasoDelPortal } from '@/lib/student/doble-factor-portal';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
import { personaEnElDispositivo } from '@/lib/student/persona-dispositivo';

/** La sesión es buena pero le falta el segundo paso (lo dice `/api/public/session`). */
class SegundoPasoPendiente extends Error {}

// Compartida por TODAS las instancias del hook (guardia + pantalla + …): una
// sola petición a /api/public/session por (estudio, usuario), no una por
// componente montado. Ver sesion-cache.ts.
const cacheSocia = new CacheSesion<SociaSesion | null>(30_000);

// La última sesión RESUELTA por estudio, para que un componente que se monta de
// nuevo (cambiar de pestaña en la app de la alumna) arranque ya resuelto en vez
// de pasar por `isLoading` —que en la guardia es un esqueleto a pantalla
// completa— mientras pregunta otra vez lo que ya sabía. Se vuelve a comprobar
// por detrás igual que siempre.
//
// ⚠️ Solo vale para la MISMA persona que tiene la sesión en el dispositivo
// (`personaEnElDispositivo`), y se vacía al cerrar sesión: una sesión recordada
// de otra alumna es el mismo error que ya cometió una caché «por estudio».
interface SesionRecordada { userId: string; socia: SociaSesion; email: string | null }
const recordadas = new Map<string, SesionRecordada>();

function sesionRecordada(baseUrl: string, slug: string): SesionRecordada | null {
  if (typeof window === 'undefined') return null;
  const r = recordadas.get(`${baseUrl}|${slug}`);
  return r && r.userId === personaEnElDispositivo() ? r : null;
}

// Versión mínima de `useSociaSession` (lib/use-socia-session.ts) para el
// bundle embebible: mismo bootstrap de sesión (JWT de supabasePortal →
// /api/public/session), pero SIN la llamada a `useStudio()` que tiene el
// original — esa llamada exige un <StudioProvider> ancestro y, más grave
// para un bundle compilado con esbuild fuera de Next, arrastra el import
// completo de lib/studio-context.tsx (God file con next/navigation y medio
// árbol de dependencias) al bundle final. El widget no necesita ese
// recargarPublico(): su propio hook (usar-datos-widget.ts) ya recarga solo.
//
// Este hook solo BOOTSTREA la sesión (lee lo que ya haya en supabasePortal,
// vía /api/public/session). Las ACCIONES de login/registro (Fase 2 del
// Booking Engine, docs/auth-widget-diseno.md) viven aparte, en
// lib/widget/usar-auth-widget.ts — separado a propósito: este hook es puro
// lectura/estado, ese otro es el que escribe (signInWithPassword,
// signInWithOtp, alta de socia).
// `baseUrl`: igual que en usar-datos-widget.ts — el bundle embebible corre en
// el DOM de la web del estudio, así que una ruta relativa a `/api/public/...`
// resolvería contra el origen del estudio, no el de Tentare.
export function useSesionWidget(slug: string, baseUrl = '') {
  const [recordada] = useState(() => sesionRecordada(baseUrl, slug));
  const [socia, setSocia] = useState<SociaSesion | null>(recordada?.socia ?? null);
  // Autenticada (JWT válido) pero SIN ficha de socia todavía en este estudio —
  // walk-in recién logueada por primera vez. Distinto de `socia === null` sin
  // más: el formulario de acceso necesita saber si toca pedir login o registro
  // (Fase 2, docs/auth-widget-diseno.md §1/§3).
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(recordada?.email ?? null);
  const [isLoading, setIsLoading] = useState(!recordada);
  // Tiene la verificación en dos pasos activada y esta sesión aún no la ha
  // pasado (lib/student/doble-factor-portal.ts). Las guardias la mandan a
  // `/acceso/dos-pasos`; el widget le pide ahí mismo el código de la app. Quien
  // no la tiene activada nunca lo ve en `true`, y no paga ninguna petición.
  const [segundoPaso, setSegundoPaso] = useState(false);

  const resolver = useCallback(async (forzar = false) => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    const claveRecordada = `${baseUrl}|${slug}`;
    if (!sb?.access_token) {
      recordadas.delete(claveRecordada);
      cacheSocia.vaciar(); setSocia(null); setUsuarioEmail(null); setSegundoPaso(false); setIsLoading(false); return;
    }
    const token = sb.access_token;
    // El paso ANTES de dar la sesión por buena: así ninguna guardia llega a
    // pedir datos con una sesión a la que el servidor se los va a negar. Sin la
    // verificación activada esto no va a la red (ver `pasoDelPortal`).
    const paso = await pasoDelPortal(token, baseUrl === '');
    setUsuarioEmail(sb.user?.email ?? null);
    if (paso === 'dos-pasos') {
      recordadas.delete(claveRecordada);
      cacheSocia.vaciar(); setSocia(null); setSegundoPaso(true); setIsLoading(false); return;
    }
    setSegundoPaso(false);
    try {
      const socia = await cacheSocia.obtener(claveSesion(baseUrl, slug, sb.user?.id ?? token), async () => {
        // ?slug= en la URL (además del body): el preflight CORS no puede leer
        // el body JSON, así que resuelve la lista blanca desde la query string.
        const res = await fetch(`${baseUrl}/api/public/session?slug=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug }),
        });
        if (res.status === 401) {
          // Por si la sesión del dispositivo aún no sabía del factor (activado en
          // otro dispositivo): el servidor manda, y lo dice con su código.
          const r = await res.json().catch(() => null) as { codigo?: string } | null;
          if (r?.codigo === CODIGO_SEGUNDO_PASO) throw new SegundoPasoPendiente();
        }
        return res.ok ? await res.json() as SociaSesion : null;
      }, Date.now(), forzar);
      if (socia && sb.user?.id) recordadas.set(claveRecordada, { userId: sb.user.id, socia, email: sb.user.email ?? null });
      else recordadas.delete(claveRecordada);
      setSocia(socia);
    } catch (e) {
      recordadas.delete(claveRecordada);
      setSocia(null);
      if (e instanceof SegundoPasoPendiente) { cacheSocia.vaciar(); setSegundoPaso(true); }
    } finally {
      setIsLoading(false);
    }
  }, [slug, baseUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Se suscribe a onAuthStateChange de Supabase. Sistema externo.
    resolver();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      // auth-js emite SIGNED_IN en CADA vuelta de pestaña, no solo al entrar:
      // no se fuerza. Otra persona tiene otra clave (userId) → falla la caché
      // sola; la misma persona la aprovecha. SIGNED_OUT vacía todo.
      if (event === 'SIGNED_OUT') { recordadas.clear(); cacheSocia.vaciar(); resolver(); }
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') resolver();
      // Acaba de escribir el código de la app: la sesión sube a `aal2` y emite
      // este evento, no SIGNED_IN. Lo que hubiera en caché era de antes.
      else if (event === 'MFA_CHALLENGE_VERIFIED') { cacheSocia.vaciar(); resolver(true); }
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  // `refrescar` (tras login/alta/firma): siempre al servidor.
  const refrescar = useCallback(() => resolver(true), [resolver]);
  return { socia, usuarioEmail, autenticado: !!usuarioEmail, isLoading, segundoPaso, refrescar };
}
