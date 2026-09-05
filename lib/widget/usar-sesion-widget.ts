import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { SociaSesion } from '@/lib/use-socia-session';
import { CacheSesion, claveSesion } from './sesion-cache';

// Compartida por TODAS las instancias del hook (guardia + pantalla + …): una
// sola petición a /api/public/session por (estudio, usuario), no una por
// componente montado. Ver sesion-cache.ts.
const cacheSocia = new CacheSesion<SociaSesion | null>(30_000);

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
  const [socia, setSocia] = useState<SociaSesion | null>(null);
  // Autenticada (JWT válido) pero SIN ficha de socia todavía en este estudio —
  // walk-in recién logueada por primera vez. Distinto de `socia === null` sin
  // más: el formulario de acceso necesita saber si toca pedir login o registro
  // (Fase 2, docs/auth-widget-diseno.md §1/§3).
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolver = useCallback(async (forzar = false) => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    if (!sb?.access_token) { cacheSocia.vaciar(); setSocia(null); setUsuarioEmail(null); setIsLoading(false); return; }
    setUsuarioEmail(sb.user?.email ?? null);
    const token = sb.access_token;
    try {
      const socia = await cacheSocia.obtener(claveSesion(baseUrl, slug, sb.user?.id ?? token), async () => {
        // ?slug= en la URL (además del body): el preflight CORS no puede leer
        // el body JSON, así que resuelve la lista blanca desde la query string.
        const res = await fetch(`${baseUrl}/api/public/session?slug=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug }),
        });
        return res.ok ? await res.json() as SociaSesion : null;
      }, Date.now(), forzar);
      setSocia(socia);
    } catch {
      setSocia(null);
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
      if (event === 'SIGNED_OUT') { cacheSocia.vaciar(); resolver(); }
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') resolver();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  // `refrescar` (tras login/alta/firma): siempre al servidor.
  const refrescar = useCallback(() => resolver(true), [resolver]);
  return { socia, usuarioEmail, autenticado: !!usuarioEmail, isLoading, refrescar };
}
