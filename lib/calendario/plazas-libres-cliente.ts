'use client';

// Llamadas de «Plazas libres» a `/api/calendario/plazas-libres`. Un cuerpo con
// otra forma es un fallo (o «no disponible»): sin datos fiables, ni botón ni cifras.

import { authHeader } from '@/lib/api-client';
import type { HuecoSesion } from './plazas-libres';

const RUTA = '/api/calendario/plazas-libres';

export async function plazasLibresDisponible(): Promise<boolean> {
  const res = await fetch(RUTA, { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return false;
  const d = (await res.json().catch(() => null)) as { disponible?: unknown } | null;
  return d?.disponible === true;
}

export interface DatosPlazasLibres {
  hoy: string; desde: string; hasta: string; sesiones: HuecoSesion[];
  /** El estudio cuenta como ocupada una plaza ofrecida a la lista de espera mientras corre su plazo. */
  ofertaOcupa: boolean;
  /** Cuándo se contó (ISO): es una foto, no un dato vivo. */
  contadoEn: string | null;
}

const esHueco = (x: unknown): x is HuecoSesion => {
  const h = x as Record<string, unknown> | null;
  return !!h && typeof h.id === 'string' && typeof h.inicio === 'string' && typeof h.libres === 'number' && typeof h.paraFija === 'number';
};

/**
 * `apagado`: el servidor dice que no está disponible para este estudio (o este
 * rol): solo con `{ disponible: false }` o un 403, nunca por un fallo de red o un
 * 5xx, que se enseñan como error con «Reintentar». `mensaje`: el texto de un 400
 * (un periodo que ya pasó), para decirlo en vez de un error genérico.
 */
export async function pedirPlazasLibres(desde: string, hasta: string, senal?: AbortSignal):
  Promise<{ ok: true; datos: DatosPlazasLibres } | { ok: false; apagado: boolean; mensaje?: string }> {
  const res = await fetch(`${RUTA}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, { headers: await authHeader(), signal: senal }).catch(() => null);
  if (!res) return { ok: false, apagado: false };
  const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 403 || d?.disponible === false) return { ok: false, apagado: true };
  if (!res.ok) return { ok: false, apagado: false, mensaje: res.status === 400 && typeof d?.error === 'string' ? d.error : undefined };
  if (!d || d.disponible !== true || typeof d.hoy !== 'string' || !Array.isArray(d.sesiones) || !d.sesiones.every(esHueco)) {
    return { ok: false, apagado: false };
  }
  return {
    ok: true,
    datos: {
      hoy: d.hoy, desde: String(d.desde), hasta: String(d.hasta), sesiones: d.sesiones,
      ofertaOcupa: d.ofertaOcupa === true, contadoEn: typeof d.contadoEn === 'string' ? d.contadoEn : null,
    },
  };
}
