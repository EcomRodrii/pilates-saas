'use client';

// Pagar y reservar UNA clase desde la app (P06 · Fase A). Aquí solo la red; la
// regla está en `pagar-clase-reglas.ts`. Ninguna función lanza: un fallo se
// traduce a un estado que la hoja sabe pintar (una promesa rota dejaría la hoja
// en «Preparando el pago…» para siempre, justo donde hay dinero).
//
// ⚠️ Ni importes ni identidad desde aquí: se manda `planId` y `sesionId`, y el
// servidor resuelve el precio, la socia (por el token) y si hay plaza.

import { portalAuthHeader } from '@/lib/student/api-publica';
import type { OfertaPrueba } from '@/lib/billing/clase-prueba';
import { avisarFaltanPreguntas } from '@/lib/student/preguntas-alta';
import {
  esperaAntesDeConsultar, leerInicioPagoClase, leerOpcionesClase, leerReservaPagada, leerReservaPrueba,
  type InicioPagoClase, type LecturaOpcionesClase, type LecturaReservaPagada, type LecturaReservaPrueba,
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
  | { tipo: 'cancelado' }
  /** P07: la prueba gratis entró en la espera (la clase de prueba sigue disponible). Solo la pinta la hoja. */
  | { tipo: 'prueba-en-espera'; posicion: number | null };

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

/**
 * La clase de prueba GRATIS (P07): la reserva de siempre con `pruebaPlanId`. El servidor concede el bono de prueba
 * (una sola vez, `concederClasePruebaGratis`) y la reserva lo gasta. Nunca lanza.
 */
export async function reservarPruebaGratis(p: {
  studioId: string; sesionId: string; spotId: string | null; pruebaPlanId: string;
}): Promise<LecturaReservaPrueba> {
  try {
    const res = await fetch('/api/public/reserva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ accion: 'crear', studioId: p.studioId, sesionId: p.sesionId, spotId: p.spotId, pruebaPlanId: p.pruebaPlanId }),
    });
    const cuerpo = await res.json().catch(() => null);
    if ((cuerpo as { codigo?: unknown } | null)?.codigo === 'faltan-preguntas') avisarFaltanPreguntas();
    return leerReservaPrueba(res.status, cuerpo);
  } catch {
    // No se sabe si llegó: el texto honesto es mirar sus reservas antes de reintentar.
    return { tipo: 'error', mensaje: 'Se ha cortado la conexión. Mira «Mis reservas» antes de volver a intentarlo.' };
  }
}

/**
 * «Tu primera clase» (P07): ¿la puede estrenar? Solo se llama si el catálogo trae una prueba activa. Fail-closed:
 * cualquier fallo es `null` y no se ofrece nada.
 */
export async function pedirPrueba(studioId: string): Promise<OfertaPrueba | null> {
  try {
    const res = await fetch(`/api/public/prueba?studioId=${encodeURIComponent(studioId)}`, { headers: await portalAuthHeader(), cache: 'no-store' });
    if (!res.ok) return null;
    const c = (await res.json().catch(() => null)) as { disponible?: unknown; oferta?: Partial<OfertaPrueba> } | null;
    const o = c?.oferta;
    if (c?.disponible !== true || !o || typeof o.planId !== 'string' || typeof o.precio !== 'number') return null;
    return {
      planId: o.planId, nombre: typeof o.nombre === 'string' ? o.nombre : 'Tu primera clase', precio: o.precio,
      gratis: o.gratis === true, tiposClaseIds: Array.isArray(o.tiposClaseIds) ? o.tiposClaseIds.filter((t): t is string => typeof t === 'string') : [],
    };
  } catch {
    return null;
  }
}
