'use client';

// Pagar y reservar UNA clase desde la app (P06 · Fase A). Aquí solo la red; la
// regla está en `pagar-clase-reglas.ts`. Ninguna función lanza: un fallo se
// traduce a un estado que la hoja sabe pintar (una promesa rota dejaría la hoja
// en «Preparando el pago…» para siempre, justo donde hay dinero).
//
// ⚠️ Ni importes ni identidad desde aquí: se manda `planId` y `sesionId`, y el
// servidor resuelve el precio, la socia (por el token) y si hay plaza.

import { portalAuthHeader } from '@/lib/student/api-publica';
import { avisarFaltanPreguntas } from '@/lib/student/preguntas-alta';
import {
  esperaAntesDeConsultar, leerInicioPagoClase, leerOpcionesClase, leerReservaPagada,
  type InicioPagoClase, type LecturaOpcionesClase, type LecturaReservaPagada,
} from '@/lib/student/pagar-clase-reglas';

export async function pedirOpcionesClase(studioId: string, sesionId: string, spotId: string | null): Promise<LecturaOpcionesClase> {
  try {
    const res = await fetch('/api/public/opciones-clase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, sesionId, spotId }),
      cache: 'no-store',
    });
    const l = leerOpcionesClase(res.status, await res.json().catch(() => null));
    if (l.tipo === 'faltan-preguntas') avisarFaltanPreguntas();
    return l;
  } catch {
    return { tipo: 'error', mensaje: 'No hemos podido comprobar la clase. Revisa tu conexión: no se te ha cobrado nada.' };
  }
}

export async function iniciarPagoDeClase(p: {
  studioId: string; planId: string; socioId: string | null; sesionId: string; spotId: string | null;
  codigoDescuento: string | null; aceptaCondiciones: boolean;
}): Promise<InicioPagoClase> {
  try {
    const res = await fetch('/api/public/checkout-embebido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({
        studioId: p.studioId, planId: p.planId, socioId: p.socioId, sesionId: p.sesionId, spotId: p.spotId,
        codigoDescuento: p.codigoDescuento || undefined, aceptaCondiciones: p.aceptaCondiciones,
      }),
    });
    const l = leerInicioPagoClase(res.status, await res.json().catch(() => null));
    if (l.tipo === 'faltan-preguntas') avisarFaltanPreguntas();
    return l;
  } catch {
    return { tipo: 'error', mensaje: 'No hemos podido iniciar el pago. Comprueba tu conexión — no se te ha cobrado nada.' };
  }
}

async function consultarReservaPagada(studioId: string, pi: string): Promise<LecturaReservaPagada> {
  try {
    const res = await fetch(
      `/api/public/estado-pago?pi=${encodeURIComponent(pi)}&studioId=${encodeURIComponent(studioId)}`,
      { headers: await portalAuthHeader(), cache: 'no-store' },
    );
    return leerReservaPagada(res.status, res.headers.get('retry-after'), await res.json().catch(() => null));
  } catch {
    return { tipo: 'en_proceso' };
  }
}

export type DesenlacePagoClase =
  | Exclude<LecturaReservaPagada, { tipo: 'en_proceso' }>
  | { tipo: 'tarda' }
  | { tipo: 'cancelado' };

/** Pregunta hasta que el servidor diga en qué acabó el pago, o se agote la espera razonable (~35 s). */
export async function esperarReservaDePago(studioId: string, pi: string, sigueVivo: () => boolean): Promise<DesenlacePagoClase> {
  let espera: number | undefined;
  for (let intento = 0; ; intento++) {
    const ms = esperaAntesDeConsultar(intento, espera);
    if (ms == null) return { tipo: 'tarda' };
    await new Promise((r) => setTimeout(r, ms));
    if (!sigueVivo()) return { tipo: 'cancelado' };
    const l = await consultarReservaPagada(studioId, pi);
    if (!sigueVivo()) return { tipo: 'cancelado' };
    if (l.tipo !== 'en_proceso') return l;
    espera = l.esperaMinMs;
  }
}
