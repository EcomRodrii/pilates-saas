'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { proyectarGamificacion } from '@/lib/student/mapeo';
import { hoyISO } from '@/lib/student/formato';
import type { GamificacionVista } from '@/lib/student/tipos';
import { getMinimoRacha } from '@/lib/student/datos';
import { clasesHechasDelHistorial, rachaSemanas } from '@/lib/student/ritmo';

// Gamificación: sale del MISMO payload que todo lo demás (cero peticiones
// nuevas) y se escribe contra las rutas que ya existían — `/api/public/canje`
// y `/api/public/retos`, ambas con la socia derivada del JWT. Aquí no se
// decide nada: quién puede canjear y si le llega el saldo lo dice el servidor.

const VACIA: GamificacionVista = {
  hay: false, saldo: 0, totalGanado: 0, totalCanjeado: 0, diasParaCaducar: null,
  nivel: { actual: null, siguiente: null, faltan: null, progreso: 0 },
  logros: [], retos: [], recompensas: [], canjes: [],
  formasDeGanar: [], creditosPorClase: null,
};

export async function getGamificacion(slug: string): Promise<GamificacionVista> {
  const d = await catalogo(slug);
  return d ? proyectarGamificacion(d, hoyISO()) : VACIA;
}

export type ResultadoCanje =
  /** `codigo` es el que la socia enseña en el estudio. Viene del servidor: es
   *  el mismo que queda guardado en su canje, no uno inventado aquí. */
  | { ok: true; codigo: string | null }
  | { ok: false; error: string };

/**
 * Claves de canje por recompensa, vivas mientras no haya respuesta del servidor.
 * Un segundo toque (o un reintento tras perder la red) reutiliza la MISMA clave,
 * y el servidor lo reconoce como el mismo canje. Se borra en cuanto el servidor
 * contesta (con éxito o con un rechazo): el siguiente canje será otro.
 */
const clavesDeCanje = new Map<string, string>();
const canjesEnVuelo = new Map<string, Promise<ResultadoCanje>>();

function nuevaClave(): string {
  const c = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return c.replace(/[^A-Za-z0-9_-]/g, '').padEnd(8, '0').slice(0, 80);
}

/** Canjea una recompensa. El saldo lo descuenta el servidor de forma atómica. */
export function canjearRecompensa(slug: string, studioId: string, catalogItemId: string): Promise<ResultadoCanje> {
  const clave = `${studioId}:${catalogItemId}`;
  // Doble toque: la misma promesa, no una petición más.
  const enVuelo = canjesEnVuelo.get(clave);
  if (enVuelo) return enVuelo;
  const p = canjearUnaVez(slug, studioId, catalogItemId, clave).finally(() => { canjesEnVuelo.delete(clave); });
  canjesEnVuelo.set(clave, p);
  return p;
}

async function canjearUnaVez(slug: string, studioId: string, catalogItemId: string, clave: string): Promise<ResultadoCanje> {
  let idempotencyKey = clavesDeCanje.get(clave);
  if (!idempotencyKey) { idempotencyKey = nuevaClave(); clavesDeCanje.set(clave, idempotencyKey); }
  try {
    const res = await fetch('/api/public/canje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, catalogItemId, idempotencyKey }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; codigo?: string } | null;
    // Un 5xx no dice si el canje se hizo: se conserva la clave para el reintento.
    if (res.status < 500) clavesDeCanje.delete(clave);
    if (!res.ok) return { ok: false, error: cuerpo?.error ?? 'No hemos podido canjear la recompensa.' };
    // Cambian saldo, canjes y stock: el payload cacheado ya no vale.
    invalidarCatalogo(slug);
    return { ok: true, codigo: cuerpo?.codigo ?? null };
  } catch {
    // Sin respuesta: puede haberse hecho. La clave se queda para el reintento.
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

export interface RachaVista {
  /** Semanas seguidas cumpliendo el mínimo del estudio (la en curso solo suma si ya lo cumple). */
  semanas: number;
  /** Clases por semana que pide el estudio para mantenerla. */
  minimo: number;
}

/**
 * La racha de la alumna, con su historial REAL de clases asistidas.
 *
 * ⚠️ No sale del catálogo: ahí solo hay sesiones que aún no han terminado, y la
 * racha casi nunca pasaba de la semana en curso. Por eso pide el historial
 * aparte (hasta 100 clases, las más recientes).
 *
 * `null` = no se ha podido leer. Distinto de una racha de 0: «no lo sé» no se
 * pinta como «no has venido» (decisión del fundador: rachas solo si se calculan
 * bien).
 */
export async function getRacha(slug: string, studioId: string, hoy: string = hoyISO()): Promise<RachaVista | null> {
  try {
    const [res, minimo] = await Promise.all([
      fetch('/api/public/historial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
        body: JSON.stringify({ studioId, limite: 100 }),
      }),
      getMinimoRacha(slug),
    ]);
    if (!res.ok) return null;
    const cuerpo = (await res.json().catch(() => null)) as { clases?: Array<{ inicio: string; estado: string }> } | null;
    if (!cuerpo || !Array.isArray(cuerpo.clases)) return null;
    return { semanas: rachaSemanas(clasesHechasDelHistorial(cuerpo.clases), hoy, minimo), minimo };
  } catch {
    return null;
  }
}
