import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────────────────
// `idempotency_error` al crear un cobro: Stripe YA tiene un cobro con esta
// Idempotency-Key y otros parámetros (el mismo intento, reabierto con datos
// distintos: otro teléfono, otra matrícula, una pestaña vieja…).
//
// No es un fallo genérico y no se trata como tal:
//  · la plaza de cupo de una etapa se reserva con la MISMA clave, así que puede ser
//    la del cobro de antes: solo se suelta si ningún cobro la tiene ligada
//    (`liberarPlazaSinCobro`: sin referencia). Si la etapa empezó entre las dos
//    peticiones, el cobro de antes no la lleva y retenerla 31 min no servía a nadie;
//  · se contesta 409 con un código propio, no un 500 «inténtalo más tarde».
//
// ⚠️ No dice que haya un pago «a medias»: el de antes puede estar cancelado (Stripe
// compara los parámetros antes de mirar nada). Saber qué cobro ocupa la clave y
// cancelarlo es de `pagos_clase` (PR-10); hasta entonces, el texto dice lo que se sabe.
// Lo que ESTA petición reservó para sí sola (una plaza de matrícula gratis, que
// `reservar_matricula` da por petición, no por clave) sí se devuelve: no la usa
// ningún cobro.
//
// Sin alias `@/`, para que `node --test` lo cargue.
// ─────────────────────────────────────────────────────────────────────────────

export const CODIGO_PAGO_EN_CURSO = 'pago-en-curso';

/** Qué se está pagando: el texto tiene que decir la verdad de ESO. */
export type QueSePaga = 'recibo' | 'compra' | 'clase';

/**
 * El 409 «pago en curso», según lo que se paga (7-oct-2026). Antes era un solo texto
 * que hablaba de «la matrícula» y de «reservar» también al pagar un recibo.
 *  · recibo y compra suelta: su clave lleva el MINUTO, así que reintentar en un
 *    minuto es otro intento y funciona. Eso es lo que se le dice.
 *  · una clase concreta: su clave NO lleva tiempo (pagar esa clase no se repite),
 *    así que reintentar da lo mismo: la salida es el estudio.
 */
export function mensajePagoEnCurso(que: QueSePaga): string {
  const nada = 'En este intento no se te ha cobrado nada.';
  const otraPantalla = 'Si lo tienes abierto en otra pantalla, termínalo allí';
  switch (que) {
    case 'recibo':
      return `No podemos preparar este pago: hace un momento se abrió otro pago de este mismo recibo con otros datos. ${nada} ${otraPantalla}; si no, vuelve a intentarlo dentro de un minuto.`;
    case 'compra':
      return `No podemos preparar este pago: hace un momento hubo otro intento de esta misma compra con otros datos (por ejemplo, otro precio o la matrícula). ${nada} ${otraPantalla}; si no, vuelve a intentarlo dentro de un minuto.`;
    case 'clase':
      return `No podemos preparar este pago: hace poco hubo otro intento de pagar esta misma clase con otros datos (por ejemplo, otro precio o la matrícula). ${nada} ${otraPantalla}; si no, escribe al estudio y te ayudará a reservar.`;
  }
}

export function esErrorDeIdempotencia(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeIdempotencyError) return true;
  const e = err as { type?: unknown; rawType?: unknown; raw?: { type?: unknown } } | null | undefined;
  return e?.type === 'StripeIdempotencyError' || e?.rawType === 'idempotency_error' || e?.raw?.type === 'idempotency_error';
}
