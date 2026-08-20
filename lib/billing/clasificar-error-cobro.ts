import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────────────────
// D-5 (auditoría 20-ago): NO todo error al cobrar off-session es un rechazo.
//
// Vive en `lib/` sin imports con alias (solo 'stripe') A PROPÓSITO: el script
// de tests barre `lib/**/*.test.ts` con node --test, que no resuelve los alias
// `@/`. La línea que separa "el dunning avanza su ciclo" de "reintenta con la
// misma clave" es dinero: tiene que estar fijada con tests, no depender de una
// revisión a ojo del catch.
//
// Las dos clases de desenlace:
//
//  · VEREDICTO — Stripe respondió y dijo que no: tarjeta declinada o que exige
//    3DS off-session (StripeCardError), método borrado / customer inexistente /
//    parámetros imposibles (StripeInvalidRequestError). El cargo NO se hizo y
//    reintentar sin cambiar nada dará lo mismo → FALLO_COBRO, el dunning
//    incrementa `intentos_reintento` y avanza (+3/+7 días, FALLIDO al tercero).
//
//  · TRANSITORIO — fallo de infraestructura con desenlace DESCONOCIDO: corte
//    de red (el cargo pudo hacerse y perderse solo la respuesta), 5xx de
//    Stripe, rate limit sostenido (el SDK ya reintentó solo antes de llegar
//    aquí, maxNetworkRetries=2), clave de API mal puesta, colisión de
//    idempotencia. Mapearlo a FALLO_COBRO era EL bug: el dunning incrementaba
//    el contador, y como la Idempotency-Key va anclada a él (`-i{n}`), el
//    siguiente barrido usaba una clave NUEVA — si el cargo original SÍ entró,
//    segundo cargo real a la socia. Sin tocar el contador, el reintento repite
//    la MISMA clave y Stripe deduplica: si el cargo entró, devuelve aquel
//    `succeeded` y el recibo se marca COBRADO; si no llegó, lo crea limpio.
//    Las dos ramas son seguras.
//
// ⚠️ Límite de las claves: se purgan a partir de las 24 h, y el dispatcher de
// dunning corre UNA vez al día ('30 8 * * *') — el reintento automático de un
// transitorio cae justo en esa frontera. Para TARJETA el hueco quedó cerrado
// por D-6: el webhook persiste `payment_intent.succeeded` de
// `origen: 'tarjeta_recibo'` (llega en segundos), así que un cargo hecho con
// respuesta perdida está COBRADO mucho antes del siguiente barrido y sale de
// la lista de candidatos. RESIDUO ABIERTO, solo SEPA: si el `create` del
// adeudo llegó y la respuesta se perdió, el PI queda vivo en `processing` SIN
// `stripe_payment_intent_id` ni EN_CURSO en el recibo — el webhook de
// `succeeded` lo resolverá al liquidar (días), pero si el barrido diario
// reintenta ANTES con la clave ya purgada, puede emitir un SEGUNDO adeudo.
// Ventana estrecha (transitorio en SEPA + clave purgada + barrido antes de la
// liquidación) y sin red hoy — documentado, no resuelto.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaseErrorCobro = 'FALLO_COBRO' | 'ERROR_TRANSITORIO';

export function clasificarErrorCobro(err: unknown): ClaseErrorCobro {
  const esVeredicto = err instanceof Stripe.errors.StripeCardError
    || err instanceof Stripe.errors.StripeInvalidRequestError;
  return esVeredicto ? 'FALLO_COBRO' : 'ERROR_TRANSITORIO';
}
