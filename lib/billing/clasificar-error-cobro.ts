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
// ⚠️ Límite conocido, y NO es un caso raro: las claves de idempotencia de
// Stripe se purgan a partir de las 24 h, y el dispatcher de dunning corre UNA
// vez al día ('30 8 * * *') — el reintento automático de un transitorio cae
// justo en esa frontera, así que su deduplicación es probable pero no
// garantizada. La protección firme es para los reintentos del MISMO día
// (endpoints manuales, re-disparos). Sigue siendo estrictamente mejor que lo
// de antes (clave nueva garantizada → doble cargo garantizado si el cargo
// había entrado); cerrar el hueco del todo es D-6 — que el webhook persista
// `payment_intent.succeeded` de `origen: 'tarjeta_recibo'` —, pendiente
// aparte. Y en SEPA muerde más fuerte: "create llegó + respuesta perdida"
// implica casi seguro un adeudo vivo en `processing`, así que una clave
// purgada allí significa un SEGUNDO adeudo, no solo un cargo síncrono
// duplicado — D-6 debe cubrir también ese matiz.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaseErrorCobro = 'FALLO_COBRO' | 'ERROR_TRANSITORIO';

export function clasificarErrorCobro(err: unknown): ClaseErrorCobro {
  const esVeredicto = err instanceof Stripe.errors.StripeCardError
    || err instanceof Stripe.errors.StripeInvalidRequestError;
  return esVeredicto ? 'FALLO_COBRO' : 'ERROR_TRANSITORIO';
}
