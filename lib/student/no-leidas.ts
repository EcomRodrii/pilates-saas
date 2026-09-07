'use client';

import { useEffect, useState } from 'react';
import { portalAuthHeader } from '@/lib/api-client';

// Cuántos avisos sin leer tiene la socia, para el punto de la campana.
//
// El punto existía en la cabecera y el badge en la nav, pero eran ramas
// MUERTAS: `StudentShell` acepta `noLeidas` y ninguna de las 20 pantallas se lo
// pasaba, así que siempre valía 0 y nunca se encendía. Pedirlo desde cada
// pantalla habría sido 20 sitios que mantener y 20 peticiones; lo pide el
// marco, una vez, y lo comparte.
//
// El endpoint ya devuelve el conteo (`{ items, unread }`): no se recalcula aquí.

const TTL_MS = 60_000;
let cache: { studioId: string; valor: number; cuando: number } | null = null;
let enVuelo: Promise<number> | null = null;
const oyentes = new Set<(n: number) => void>();

async function pedir(studioId: string): Promise<number> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return 0; // sin sesión no hay bandeja
  const res = await fetch(`/api/notifications?ambito=socia&studioId=${encodeURIComponent(studioId)}`, { headers: auth });
  if (!res.ok) return 0;
  const cuerpo = (await res.json()) as { unread?: number; items?: { readAt?: string | null }[] };
  // `unread` es lo que manda; el recuento sobre `items` es solo el respaldo
  // por si algún día la ruta deja de enviarlo.
  return cuerpo.unread ?? (cuerpo.items ?? []).filter((i) => i.readAt == null).length;
}

/**
 * Fuerza una relectura tras marcar avisos como leídos.
 *
 * ⚠️ 26ª pasada. Esta función tenía DOS fallos a la vez y ninguno se veía:
 *
 *   1. **Cero llamantes en todo el repo**, pese a que su propio comentario
 *      decía «la usa la pantalla de avisos al marcarlos como leídos». No la
 *      usaba nadie.
 *   2. Aunque se llamara, era un placebo: vaciaba `cache` y ya. No avisaba a
 *      los `oyentes` ni volvía a pedir nada, así que el punto de la campana
 *      seguía encendido hasta que caducase el TTL de 60 s — con la socia
 *      mirando una pantalla que le acababa de decir «Marcadas como leídas ✓».
 *
 * Ahora vacía, RELEE y reparte el valor nuevo a quien esté suscrito. Es
 * best-effort a propósito: si la relectura falla, el peor caso es el de antes
 * (el punto tarda un minuto), nunca un error en pantalla por un adorno.
 */
export function invalidarNoLeidas(studioId: string): void {
  cache = null;
  // Si ya hay una petición en vuelo se aprovecha: sus oyentes se avisan solos
  // al resolverse, y lanzar otra en paralelo solo duplicaría la llamada.
  if (enVuelo) return;
  enVuelo = pedir(studioId)
    .then((v) => { cache = { studioId, valor: v, cuando: Date.now() }; return v; })
    .catch(() => 0)
    .finally(() => { enVuelo = null; });
  void enVuelo.then((v) => { for (const o of oyentes) o(v); });
}

export function useNoLeidas(studioId: string): number {
  const [n, setN] = useState(() => (cache && cache.studioId === studioId ? cache.valor : 0));

  useEffect(() => {
    let vivo = true;
    const aplicar = (v: number) => { if (vivo) setN(v); };
    oyentes.add(aplicar);

    const fresco = cache && cache.studioId === studioId && Date.now() - cache.cuando < TTL_MS;
    if (fresco) {
      aplicar(cache!.valor);
    } else if (enVuelo) {
      void enVuelo.then(aplicar);
    } else {
      enVuelo = pedir(studioId)
        .then((v) => { cache = { studioId, valor: v, cuando: Date.now() }; return v; })
        .catch(() => 0)
        .finally(() => { enVuelo = null; });
      void enVuelo.then((v) => { for (const o of oyentes) o(v); });
    }

    return () => { vivo = false; oyentes.delete(aplicar); };
  }, [studioId]);

  return n;
}
