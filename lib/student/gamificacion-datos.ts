'use client';

import { portalAuthHeader } from '@/lib/api-client';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { proyectarGamificacion } from '@/lib/student/mapeo';
import { hoyISO } from '@/lib/student/formato';
import type { GamificacionVista } from '@/lib/student/tipos';

// Gamificación: sale del MISMO payload que todo lo demás (cero peticiones
// nuevas) y se escribe contra las rutas que ya existían — `/api/public/canje`
// y `/api/public/retos`, ambas con la socia derivada del JWT. Aquí no se
// decide nada: quién puede canjear y si le llega el saldo lo dice el servidor.

const VACIA: GamificacionVista = {
  hay: false, saldo: 0, totalGanado: 0, totalCanjeado: 0,
  nivel: { actual: null, siguiente: null, faltan: null, progreso: 0 },
  logros: [], retos: [], recompensas: [],
};

export async function getGamificacion(slug: string): Promise<GamificacionVista> {
  const d = await catalogo(slug);
  return d ? proyectarGamificacion(d, hoyISO()) : VACIA;
}

export type ResultadoCanje = { ok: true } | { ok: false; error: string };

/** Canjea una recompensa. El saldo lo descuenta el servidor de forma atómica. */
export async function canjearRecompensa(slug: string, studioId: string, catalogItemId: string): Promise<ResultadoCanje> {
  try {
    const res = await fetch('/api/public/canje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, catalogItemId }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok) return { ok: false, error: cuerpo?.error ?? 'No hemos podido canjear la recompensa.' };
    // Cambian saldo, canjes y stock: el payload cacheado ya no vale.
    invalidarCatalogo(slug);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

/** Apuntarse o borrarse de un reto. `false` si el servidor no lo guardó. */
export async function apuntarseReto(slug: string, studioId: string, retoId: string, apuntarse: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/public/retos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, retoKey: retoId, accion: apuntarse ? 'marcar' : 'desmarcar' }),
    });
    if (!res.ok) return false;
    invalidarCatalogo(slug);
    return true;
  } catch {
    return false;
  }
}
