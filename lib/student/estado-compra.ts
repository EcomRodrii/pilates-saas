'use client';

// El sondeo de «¿ya está mi bono?» después de pagar en la app (P01). La regla
// está en `estado-compra-reglas.ts`; aquí solo la red.

import { portalAuthHeader } from '@/lib/student/api-publica';
import {
  esperaAntesDe, leerEstadoCompra, leerEstadoRecibo, type CompraEntregada, type LecturaEstadoCompra, type LecturaEstadoRecibo,
} from '@/lib/student/estado-compra-reglas';

/** Una consulta. Nunca lanza: sin red, «en proceso». */
export async function consultarEstadoCompra(studioId: string, pi: string): Promise<LecturaEstadoCompra> {
  try {
    const res = await fetch(
      `/api/public/estado-pago?pi=${encodeURIComponent(pi)}&studioId=${encodeURIComponent(studioId)}`,
      { headers: await portalAuthHeader(), cache: 'no-store' },
    );
    const cuerpo = await res.json().catch(() => null);
    return leerEstadoCompra(res.status, res.headers.get('retry-after'), cuerpo);
  } catch {
    return { tipo: 'en_proceso' };
  }
}

export type DesenlaceCompra =
  | { tipo: 'entregada'; compra: CompraEntregada }
  | { tipo: 'tarda' }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' }
  /** Quien preguntaba ya no está (la hoja se cerró). */
  | { tipo: 'cancelado' };

/**
 * Pregunta hasta que el servidor diga que el bono está, o hasta agotar la espera
 * razonable. `sigueVivo` lo consulta antes de cada paso: si la hoja se desmonta,
 * se deja de preguntar.
 */
export async function esperarCompraEntregada(
  studioId: string, pi: string, sigueVivo: () => boolean,
): Promise<DesenlaceCompra> {
  let espera: number | undefined;
  for (let intento = 0; ; intento++) {
    const ms = esperaAntesDe(intento, espera);
    if (ms == null) return { tipo: 'tarda' };
    await new Promise((r) => setTimeout(r, ms));
    if (!sigueVivo()) return { tipo: 'cancelado' };
    const l = await consultarEstadoCompra(studioId, pi);
    if (!sigueVivo()) return { tipo: 'cancelado' };
    if (l.tipo === 'entregada' || l.tipo === 'sesion' || l.tipo === 'dos-pasos') return l;
    espera = l.esperaMinMs;
  }
}

/** Una consulta del recibo. Nunca lanza: sin red, «en proceso». */
export async function consultarEstadoRecibo(studioId: string, reciboId: string): Promise<LecturaEstadoRecibo> {
  try {
    const res = await fetch(
      `/api/public/estado-pago?reciboId=${encodeURIComponent(reciboId)}&studioId=${encodeURIComponent(studioId)}`,
      { headers: await portalAuthHeader(), cache: 'no-store' },
    );
    const cuerpo = await res.json().catch(() => null);
    return leerEstadoRecibo(res.status, res.headers.get('retry-after'), cuerpo);
  } catch {
    return { tipo: 'en_proceso' };
  }
}

export type DesenlaceRecibo =
  | { tipo: 'pagado'; renovadoHasta: string | null }
  | { tipo: 'tarda' } | { tipo: 'sesion' } | { tipo: 'dos-pasos' } | { tipo: 'cancelado' };

/** Pregunta hasta que el servidor lea el recibo COBRADO, o se agote la espera razonable. */
export async function esperarReciboPagado(
  studioId: string, reciboId: string, sigueVivo: () => boolean,
): Promise<DesenlaceRecibo> {
  let espera: number | undefined;
  for (let intento = 0; ; intento++) {
    const ms = esperaAntesDe(intento, espera);
    if (ms == null) return { tipo: 'tarda' };
    await new Promise((r) => setTimeout(r, ms));
    if (!sigueVivo()) return { tipo: 'cancelado' };
    const l = await consultarEstadoRecibo(studioId, reciboId);
    if (!sigueVivo()) return { tipo: 'cancelado' };
    if (l.tipo !== 'en_proceso') return l;
    espera = l.esperaMinMs;
  }
}
