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

export const MENSAJE_PAGO_EN_CURSO =
  'No podemos preparar este pago: hace poco hubo otro intento de pago de esta misma compra con datos distintos (por ejemplo, otro precio o la matrícula). En este intento no se te ha cobrado nada. Si tienes ese pago abierto en otra pantalla, termínalo allí; si no, escribe al estudio y te ayudará a reservar.';

export function esErrorDeIdempotencia(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeIdempotencyError) return true;
  const e = err as { type?: unknown; rawType?: unknown; raw?: { type?: unknown } } | null | undefined;
  return e?.type === 'StripeIdempotencyError' || e?.rawType === 'idempotency_error' || e?.raw?.type === 'idempotency_error';
}
