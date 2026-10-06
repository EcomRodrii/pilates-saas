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
// la lista de candidatos. El residuo que quedaba en SEPA (el `create` del
// adeudo llegó, la respuesta se perdió y el barrido siguiente reintentaba con la
// clave ya purgada: un SEGUNDO adeudo) lo cierra la marca de «cobro en marcha»
// (lib/billing/cobro-off-session-marca.ts): un ERROR_TRANSITORIO deja el recibo
// reservado, nada vuelve a entrar pasados unos minutos, y el conciliador horario
// la resuelve preguntando a Stripe (EN_CURSO con ese adeudo, o soltarla si no
// hay ningún cargo).
// ─────────────────────────────────────────────────────────────────────────────

//
// · CLAVE_CON_OTROS_DATOS (6-oct-2026) — `idempotency_error`: Stripe NO ejecutó esta
//   petición porque la clave ya se usó con OTROS parámetros. Antes caía en
//   «transitorio» sin más, y como la clave no cambiaba hasta el siguiente nº de
//   intento, el recibo quedaba ~24 h sin poder cobrarse y sin que nadie lo viera
//   (pasaba al cambiar de tarjeta: la clave no llevaba el método). La clave lleva
//   hoy método e importe (`claveCobroOffSession`), así que esto no debería volver a
//   pasar; si pasa, es un fallo nuestro y se dice FUERTE, no se reintenta a ciegas.
//   Para el dinero se trata como un transitorio (no sube el contador, no suelta la
//   marca: lo que hizo el primer uso de esa clave no se sabe desde aquí y lo
//   resuelve el conciliador preguntando a Stripe), pero con su propio desenlace.
//
// · `idempotency_key_in_use` (otra petición con la MISMA clave sigue en vuelo) es
//   un transitorio de verdad, venga con el tipo que venga: el cargo de la otra puede
//   estar entrando. Leerlo como veredicto soltaba la marca y subía el contador.

export type ClaseErrorCobro = 'FALLO_COBRO' | 'ERROR_TRANSITORIO' | 'CLAVE_CON_OTROS_DATOS';

export function clasificarErrorCobro(err: unknown): ClaseErrorCobro {
  const e = err as { code?: unknown; type?: unknown; rawType?: unknown } | null | undefined;
  if (e?.code === 'idempotency_key_in_use') return 'ERROR_TRANSITORIO';
  if (err instanceof Stripe.errors.StripeIdempotencyError || e?.rawType === 'idempotency_error') return 'CLAVE_CON_OTROS_DATOS';
  const esVeredicto = err instanceof Stripe.errors.StripeCardError
    || err instanceof Stripe.errors.StripeInvalidRequestError;
  return esVeredicto ? 'FALLO_COBRO' : 'ERROR_TRANSITORIO';
}
