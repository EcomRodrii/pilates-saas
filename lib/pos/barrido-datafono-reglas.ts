import type Stripe from 'stripe';
import { motivoRechazoDatafono } from './datafono.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cobros del datáfono de Stripe que se quedaron a medias sin nadie mirando la
// Caja: qué hace con cada uno el conciliador horario (lib/pos/barrido-datafono.ts).
//
// El sondeo de la Caja los resuelve en segundos mientras alguien espera (90 s).
// Pasado eso, o con la pestaña cerrada, nadie los vuelve a mirar: el aviso
// `payment_failed` ya no anula si el lector seguía con el cobro (con un datáfono
// físico, el pago sin contacto «se rechaza» y el lector pide el PIN en la misma
// acción), y un `succeeded` cuyo aviso se perdió dejaba la venta sin cerrar.
//
// Puro, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minutos que se dejan a la Caja y al lector antes de tocar un cobro. Holgado
 * a propósito: la Caja espera 90 s, y meter el PIN puede llevar más.
 */
export const MINUTOS_ANTES_DE_RESOLVER_DATAFONO = 15;

/**
 * - `cerrar`: entró y la base aún lo tiene en vuelo → se cierra como el aviso.
 * - `liberar`: ya está cancelado en Stripe → se anula la venta o se suelta el recibo.
 * - `mirar`: espera tarjeta → rechazado o abandonado si el lector ya no está con él
 *   (`cerrarSiRechazadoDatafono` con `sinTarjeta`); si sigue, se deja.
 * - `null`: no es del datáfono, no es de este estudio, es reciente o está en vuelo.
 */
export type AccionDatafono = 'cerrar' | 'liberar' | 'mirar';

export function accionCobroDatafono(
  pi: Pick<Stripe.PaymentIntent, 'status' | 'created' | 'metadata'>,
  studioId: string,
  ahoraSeg: number,
): AccionDatafono | null {
  const md = pi.metadata ?? {};
  if (md.origen !== 'pos_terminal') return null;
  // La metadata solo CONFIRMA el estudio; la autoridad es la cuenta listada.
  if (md.studioId && md.studioId !== studioId) return null;
  if (!md.ventaId && !md.reciboId) return null;
  if (ahoraSeg - pi.created < MINUTOS_ANTES_DE_RESOLVER_DATAFONO * 60) return null;
  if (pi.status === 'succeeded') return 'cerrar';
  if (pi.status === 'canceled') return 'liberar';
  if (pi.status === 'requires_payment_method') return 'mirar';
  return null;
}

/** Con qué motivo y estado se anula lo que el conciliador da por terminado sin cobrar. */
export function liberacionDatafono(
  veredicto: 'rechazado' | 'abandonado' | 'cancelado',
  rechazo?: { code?: string | null; decline_code?: string | null } | null,
): { motivo: string; pagoEstado: 'RECHAZADO' | 'CANCELADO' } {
  if (veredicto === 'rechazado') return { motivo: motivoRechazoDatafono(rechazo), pagoEstado: 'RECHAZADO' };
  if (veredicto === 'abandonado') return { motivo: 'El cobro no llegó a completarse en el datáfono. No se ha cobrado nada.', pagoEstado: 'CANCELADO' };
  return { motivo: 'El cobro se canceló sin completarse. No se ha cobrado nada.', pagoEstado: 'CANCELADO' };
}

/**
 * ⚠️ La garantía principal del barrido: solo se toca lo que la base sigue teniendo
 * EN VUELO con ESE cobro (una venta en PENDIENTE_PAGO que lo lleva, o un recibo con
 * él en `cobro_mostrador_pi`). Lo demás ya lo cerró el aviso o la Caja, o es de un
 * intento más nuevo.
 */
export function enVuelo<T extends { pi: { id: string; metadata: Stripe.Metadata } }>(
  candidatos: T[],
  ventas: { id: string; stripe_payment_intent_id: string | null }[],
  recibos: { id: string; cobro_mostrador_pi: string | null }[],
): T[] {
  const vivas = new Set<string>();
  for (const v of ventas) if (v.stripe_payment_intent_id) vivas.add(`venta|${v.id}|${v.stripe_payment_intent_id}`);
  for (const r of recibos) if (r.cobro_mostrador_pi) vivas.add(`recibo|${r.id}|${r.cobro_mostrador_pi}`);
  return candidatos.filter(({ pi }) => {
    const md = pi.metadata;
    return md.ventaId
      ? vivas.has(`venta|${md.ventaId}|${pi.id}`)
      : !!md.reciboId && vivas.has(`recibo|${md.reciboId}|${pi.id}`);
  });
}

