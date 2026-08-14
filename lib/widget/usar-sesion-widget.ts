import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { SociaSesion } from '@/lib/use-socia-session';

// Versión mínima de `useSociaSession` (lib/use-socia-session.ts) para el
// bundle embebible: mismo bootstrap de sesión (JWT de supabasePortal →
// /api/public/session), pero SIN la llamada a `useStudio()` que tiene el
// original — esa llamada exige un <StudioProvider> ancestro y, más grave
// para un bundle compilado con esbuild fuera de Next, arrastra el import
// completo de lib/studio-context.tsx (God file con next/navigation y medio
// árbol de dependencias) al bundle final. El widget no necesita ese
// recargarPublico(): su propio hook (usar-datos-widget.ts) ya recarga solo.
//
// Sin enviarEnlace/establecerPassword/loginConPassword a propósito: el
// bundle no reimplementa el flujo de login completo (magic link + captcha
// + contrato) dentro del Shadow DOM — eso sigue viviendo en /reservar/[slug]
// (Modo A). Esto solo BOOTSTREA una sesión que YA existe (visitante que
// volvió tras loguearse antes en el portal/la página completa); sin sesión
// previa, el widget deja reservar mediante el enlace a la página completa.
// `baseUrl`: igual que en usar-datos-widget.ts — el bundle embebible corre en
// el DOM de la web del estudio, así que una ruta relativa a `/api/public/...`
// resolvería contra el origen del estudio, no el de Tentare.
export function useSesionWidget(slug: string, baseUrl = '') {
  const [socia, setSocia] = useState<SociaSesion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolver = useCallback(async () => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    if (!sb?.access_token) { setSocia(null); setIsLoading(false); return; }
    try {
      // ?slug= en la URL (además del body): el preflight CORS no puede leer
      // el body JSON, así que resuelve la lista blanca desde la query string.
      const res = await fetch(`${baseUrl}/api/public/session?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sb.access_token}` },
        body: JSON.stringify({ slug }),
      });
      setSocia(res.ok ? await res.json() as SociaSesion : null);
    } catch {
      setSocia(null);
    } finally {
      setIsLoading(false);
    }
  }, [slug, baseUrl]);

  useEffect(() => {
    resolver();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') resolver();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolver]);

  return { socia, isLoading };
}
