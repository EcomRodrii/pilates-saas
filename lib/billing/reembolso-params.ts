// ─────────────────────────────────────────────────────────────────────────────
// Los parámetros del reembolso que se le mandan a Stripe.
//
// Existe por un fallo concreto, en producción, con dinero real delante: el
// primer intento mandaba `refund_application_fee: true` SIEMPRE, dando por
// hecho que Stripe lo ignoraría cuando no hubiera comisión de plataforma.
// No lo ignora — responde:
//
//   «Attempting to refund_application_fee on ch_…, but it has no application fee»
//
// Y como el take-rate de plataforma está apagado por defecto
// (`applicationFeeAmount`, lib/billing/stripe-fees.ts), NINGÚN cobro tiene
// comisión: fallaban el 100 % de las devoluciones. No se devolvió dinero de más
// ni de menos —el error salta antes de crear nada— pero no se podía devolver.
//
// La bandera sigue haciendo falta el día que el take-rate se encienda: si no,
// el estudio devuelve 60 € y encima paga la comisión de una venta que ya no
// existe. Así que no se quita: se pone SOLO cuando hay comisión que devolver.
//
// Vive aparte del handler para poder probarlo sin llamar a Stripe. Es
// exactamente el tipo de detalle que ninguna prueba de este repo ve —los e2e
// mockean la red— y por eso se rompió en producción y no antes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParamsReembolso {
  payment_intent: string;
  refund_application_fee?: true;
}

/**
 * @param applicationFeeAmount `payment_intent.application_fee_amount` en
 *   céntimos. `null`/`undefined`/0 = el cobro no llevó comisión de plataforma.
 */
export function paramsReembolso(
  paymentIntentId: string,
  applicationFeeAmount: number | null | undefined,
): ParamsReembolso {
  const hayComision = typeof applicationFeeAmount === 'number' && applicationFeeAmount > 0;
  return hayComision
    ? { payment_intent: paymentIntentId, refund_application_fee: true }
    : { payment_intent: paymentIntentId };
}
