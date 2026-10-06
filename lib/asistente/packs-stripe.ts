// ─────────────────────────────────────────────────────────────────────────────
// Qué hacer con un evento de Stripe de un pack de consultas. PURO (sin red ni
// base de datos): lo usan el webhook de la plataforma (/api/billing/webhook),
// que es el ÚNICO que crea o retira packs, y el de Connect (/api/stripe/webhook),
// que tiene que reconocerlos para NO tocarlos.
//
// El pack es dinero de Tentare (cuenta de PLATAFORMA, como la suscripción
// SaaS), no de una socia: nunca pasa por Connect.
//
// Reglas (encargo del 6-oct-2026 + revisión de cobros):
//   · Se acredita cuando el pago está CONFIRMADO: `checkout.session.completed`
//     con `payment_status === 'paid'` (tarjeta) o
//     `checkout.session.async_payment_succeeded` (métodos diferidos; hoy el
//     Checkout solo ofrece tarjeta, pero el camino queda cubierto). Un
//     `completed` sin pagar todavía espera: no hay escritura optimista.
//   · Un reembolso TOTAL o una disputa PERDIDA retira el pack: pasa a
//     REEMBOLSADO y deja de gastarse. Lo ya consumido no se devuelve al libro
//     (esas consultas se respondieron y Anthropic las cobró).
//   · Un reembolso PARCIAL no lo retira (puede ser una cortesía de 1 €): se avisa
//     a Sentry para que una persona decida. Retirarlo entero dejaría a la
//     propietaria sin las consultas que pagó y no se le han devuelto.
// ─────────────────────────────────────────────────────────────────────────────

import { ORIGEN_PACK, centimosDe, packPorUnidades } from './packs.ts';

type Metadata = Record<string, string> | null | undefined;
type Ref = string | { id: string } | null | undefined;

const idDe = (r: Ref): string | null => (typeof r === 'string' ? r : r?.id ?? null);

/** ¿Este objeto de Stripe (sesión, PaymentIntent, cargo, factura) es de un pack? */
export function esDePack(obj: { metadata?: Metadata } | null | undefined): boolean {
  return obj?.metadata?.origen === ORIGEN_PACK;
}

/**
 * Para el webhook de Connect: ¿es un evento de un pack, que NO le toca? Mira la
 * metadata del objeto del evento (sesión, PaymentIntent, cargo o factura).
 */
export function eventoDePack(event: { type: string; data: { object: unknown } }): boolean {
  return esDePack(event.data.object as { metadata?: Metadata });
}

export interface SesionPackLike {
  id: string;
  mode?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Metadata;
  payment_intent?: Ref;
  client_reference_id?: string | null;
}

export type DecisionAcreditar =
  | {
      accion: 'acreditar';
      studioId: string;
      unidades: 100 | 300 | 1000;
      /** Lo cobrado de verdad (amount_total), no el catálogo. */
      precioEur: number;
      sessionId: string;
      paymentIntentId: string | null;
      /** Cobrado MÁS que el catálogo (cambió entre crear y pagar): se acredita y se avisa. */
      importeDistinto: boolean;
    }
  | { accion: 'no_es_pack' }
  | { accion: 'esperar' }
  | { accion: 'invalido'; motivo: string };

export function decidirAcreditacion(s: SesionPackLike): DecisionAcreditar {
  if (!esDePack(s)) return { accion: 'no_es_pack' };
  if (s.mode !== 'payment') return { accion: 'invalido', motivo: 'modo' };
  // Pago diferido aún sin confirmar (SEPA…): lo acreditará async_payment_succeeded.
  if (s.payment_status !== 'paid') return { accion: 'esperar' };
  const studioId = s.metadata?.studio_id;
  if (!studioId) return { accion: 'invalido', motivo: 'sin_estudio' };
  const pack = packPorUnidades(Number(s.metadata?.pack));
  if (!pack) return { accion: 'invalido', motivo: 'pack_desconocido' };
  if ((s.currency ?? '').toLowerCase() !== 'eur' || typeof s.amount_total !== 'number' || s.amount_total <= 0) {
    return { accion: 'invalido', motivo: 'importe' };
  }
  // Lo pone el servidor al crear la sesión, igual que la metadata: si no casan, no es nuestra.
  if (s.client_reference_id !== studioId) return { accion: 'invalido', motivo: 'referencia' };
  // Cobrado MENOS que el catálogo: no se regala la diferencia (sin códigos de descuento, no debería pasar nunca).
  if (s.amount_total < centimosDe(pack)) return { accion: 'invalido', motivo: 'importe_inferior' };
  return {
    accion: 'acreditar',
    studioId,
    unidades: pack.unidades,
    precioEur: s.amount_total / 100,
    sessionId: s.id,
    paymentIntentId: idDe(s.payment_intent),
    importeDistinto: s.amount_total !== centimosDe(pack),
  };
}

/** Qué hace un reembolso con el pack: el total lo retira; el parcial se avisa y no se toca. */
export function efectoDelReembolso(charge: { amount_refunded?: number | null; refunded?: boolean | null; amount?: number | null }): 'retirar' | 'parcial' | 'nada' {
  if (charge.refunded === true) return 'retirar';
  const devuelto = charge.amount_refunded ?? 0;
  if (devuelto <= 0) return 'nada';
  return typeof charge.amount === 'number' && devuelto >= charge.amount ? 'retirar' : 'parcial';
}

/**
 * Solo una disputa PERDIDA (el banco le dio la razón a la clienta) retira el
 * pack. Llega por `charge.dispute.closed` o ya en `charge.dispute.created`: las
 * de adeudo SEPA nacen `lost` (lib/billing/disputas-por-conciliar.ts).
 */
export function disputaRetiraElPack(dispute: { status?: string | null }): boolean {
  return dispute.status === 'lost';
}

export { idDe as idDeReferencia };
