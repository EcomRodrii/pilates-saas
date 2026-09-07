// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Auditoría 26ª pasada (7 sep 2026) — A-1, mitad TypeScript.
//
// Qué recibos se pueden PAGAR. Existe porque el repo tenía cuatro listas
// distintas diciendo cosas distintas sobre lo mismo:
//
//   · `lib/billing/stripe-cobros.ts`      → PENDIENTE, FALLIDO
//   · `dbMarcarCobrado` (supabase-data)   → PENDIENTE, FALLIDO, DEVUELTO
//   · `confirmarCobroRecibo`              → PENDIENTE, FALLIDO, EN_CURSO
//   · `/api/stripe/checkout`              → PENDIENTE, y solo PENDIENTE
//
// #1694 («un recibo impagado no se podía cobrar a mano, y la app decía lo
// contrario») amplió los dos primeros y se dejó el cuarto — que es justamente
// el ÚNICO camino por el que la socia paga ella misma. Con el bloqueo por
// impago encendido (migr 20260905151515) eso la deja sin poder reservar Y sin
// poder pagar: el mensaje de mostrador la manda a «marcar como cobrado» un
// recibo que nadie ha cobrado, y `stripe-cobros.ts` la manda, cuando salta 3DS,
// a «pagar desde un enlace de cobro normal» — el enlace que devolvía 409.
//
// Medido en producción: 3 socias de `studio-1`, 107,00 €, sin vía de pago
// online desde el 5 de septiembre.
//
// El criterio es el mismo que el de la RPC `socio_tiene_impago`
// (migr 20260907120000) y de ahí sale: **lo que bloquea por deuda tiene que
// poder pagarse**. Si divergen, vuelve el callejón sin salida — y hay un test
// que los cruza (`deuda-recibo.test.ts`), que DERIVA la lista de la migración
// vigente en vez de repetirla a mano.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoRecibo } from '@/lib/types';

/**
 * Estados en los que un recibo todavía representa dinero que la socia debe.
 *
 * `EN_CURSO` queda fuera a propósito: hay un cobro en vuelo y abrir un segundo
 * checkout sobre él es la puerta al doble cobro que cerró la migración
 * 20260817214500 (`checkout_session_id`).
 */
export const ESTADOS_COBRABLES: readonly EstadoRecibo[] = ['PENDIENTE', 'FALLIDO', 'DEVUELTO'];

/** Lo mínimo que hace falta saber de un recibo para decidir si es deuda. */
export type ReciboParaDeuda = {
  estado: EstadoRecibo | string;
  importe: number | string;
  importe_devuelto?: number | string | null;
  reembolso_stripe_id?: string | null;
  reembolso_solicitado_en?: string | null;
};

/**
 * ¿Este recibo se puede cobrar?
 *
 * Espejo exacto de `socio_tiene_impago` en SQL, con una diferencia deliberada:
 * allí `PENDIENTE` no cuenta como impago (puede estar en plazo), pero aquí sí
 * es cobrable — un recibo en plazo se paga igual, solo que no bloquea.
 */
export function esReciboCobrable(r: ReciboParaDeuda): boolean {
  if (!ESTADOS_COBRABLES.includes(r.estado as EstadoRecibo)) return false;
  // Un reembolso ya pedido a Stripe es dinero que va DE VUELTA a la socia:
  // volver a cobrárselo sería cobrar dos veces por lo mismo.
  if (r.reembolso_stripe_id || r.reembolso_solicitado_en) return false;
  const devuelto = Number(r.importe_devuelto ?? 0);
  const importe = Number(r.importe);
  // `importe_devuelto` es `not null default 0`: un recibo devuelto POR EL BANCO
  // (nunca se llegó a cobrar) tiene 0 aquí y sigue siendo cobrable, que es el
  // caso para el que existe el botón.
  if (Number.isFinite(devuelto) && Number.isFinite(importe) && devuelto >= importe) return false;
  return true;
}

/**
 * El mismo veredicto que la RPC: ¿esta fila cuenta como IMPAGO (y por tanto
 * bloquea el autoservicio)? `PENDIENTE` no.
 */
export function esReciboImpagado(r: ReciboParaDeuda): boolean {
  return r.estado !== 'PENDIENTE' && esReciboCobrable(r);
}
