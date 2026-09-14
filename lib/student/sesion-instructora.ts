'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { CacheSesion, claveSesion } from '@/lib/widget/sesion-cache';

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

/**
 * @param activo  `false` = no preguntar (p. ej. mientras no hay sesión).
 * @param forzar  ignora lo recordado: para quien acaba de entrar por un enlace.
 */
export function useSesionInstructora(slug: string, activo = true, forzar = false) {
  const [resuelto, setResuelto] = useState<{ slug: string; valor: InstructoraSesion | null } | null>(null);

  const resolver = useCallback(async (forzarAhora: boolean) => {
    const { data: { session: sb } } = await supabasePortal.auth.getSession();
    const userId = sb?.user?.id;
    if (!sb?.access_token || !userId) { setResuelto({ slug, valor: null }); return; }
    if (!forzarAhora && noEsReciente(slug, userId)) { setResuelto({ slug, valor: null }); return; }
    const token = sb.access_token;
    try {
      const valor = await cacheInstructora.obtener(claveSesion('', slug, userId), async () => {
        const res = await fetch('/api/portal/instructora/sesion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug }),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`instructora/sesion ${res.status}`);
        const cuerpo = await res.json() as { instructora?: InstructoraSesion | null };
        return cuerpo.instructora ?? null;
      }, Date.now(), forzarAhora);
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

  const refrescar = useCallback(() => resolver(true), [resolver]);
  const listo = resuelto?.slug === slug;
  return {
    instructora: activo && listo ? resuelto.valor : null,
    isLoading: activo && !listo,
    refrescar,
  };
}
