import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────────────────
// `idempotency_error` al crear un cobro: Stripe YA tiene un cobro con esta
// Idempotency-Key y otros parámetros (el mismo intento, reabierto con datos
// distintos: otro teléfono, otra matrícula, una pestaña vieja…).
//
// No es un fallo genérico y no se trata como tal:
//  · el cobro de ANTES sigue vivo y se puede pagar, así que lo que retiene (la
//    plaza de cupo de una etapa, que se reserva con la MISMA clave y por eso es
//    la misma plaza) NO se suelta: soltarla vendía una plaza de más;
//  · se contesta 409 con un código propio, no un 500 «inténtalo más tarde».
// Lo que ESTA petición reservó para sí sola (una plaza de matrícula gratis, que
// `reservar_matricula` da por petición, no por clave) sí se devuelve: no la usa
// ningún cobro.
//
// Sin alias `@/`, para que `node --test` lo cargue.
// ─────────────────────────────────────────────────────────────────────────────

export const CODIGO_PAGO_EN_CURSO = 'pago-en-curso';

export const MENSAJE_PAGO_EN_CURSO =
  'Ya tienes un pago de esta compra a medias. Si ya lo has pagado, te llegará la confirmación; si no, inténtalo de nuevo más tarde o escribe al estudio.';

export function esErrorDeIdempotencia(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeIdempotencyError) return true;
  const e = err as { type?: unknown; rawType?: unknown; raw?: { type?: unknown } } | null | undefined;
  return e?.type === 'StripeIdempotencyError' || e?.rawType === 'idempotency_error' || e?.raw?.type === 'idempotency_error';
}
