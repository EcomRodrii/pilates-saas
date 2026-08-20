import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Clave de idempotencia del PaymentIntent del checkout embebido.
//
// Vive en `lib/` y no dentro del route handler A PROPÓSITO: el script de tests
// solo barre `lib/**/*.test.ts`, así que la lógica que decide si dos intentos
// de pago son "el mismo" tiene que ser importable para poder fijarla con tests.
// Es dinero: no puede depender de una revisión a ojo del handler.
//
// ⚠️ HISTORIA — la versión anterior era
//   `checkout-embebido-${studioId}-${planId}-${socioId ?? 'guest'}-${minuto}`
// y tenía dos fallos OPUESTOS:
//
//  1. DOS COBROS. Dos pestañas (o volver atrás y reintentar) separadas por más
//     de 60 s daban claves distintas → dos PaymentIntents cobrables del mismo
//     plan. Pagados los dos, el webhook entregaba los dos —los ids de entrega
//     se derivan de `pi.id`, que es distinto— y salían dos recibos `rec-web-…`
//     COBRADOS y dos suscripciones. A diferencia del camino de recibo, que
//     reserva el recibo con `checkout_session_id` y avisa del segundo cobro,
//     aquí no había NADA que lo detectara.
//
//  2. COLISIÓN ENTRE PERSONAS. Para invitadas la clave era literalmente
//     `…-guest-<minuto>`: dos visitantes distintas comprando el mismo plan en
//     el mismo minuto compartían clave con parámetros distintos
//     (`receipt_email`), Stripe rechazaba la segunda y esa persona NO PODÍA
//     PAGAR. Un fallo de ventas, no solo de seguridad.
//
// La clave ahora identifica el INTENTO, no el instante.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosClaveCheckoutEmbebido {
  studioId: string;
  planId: string;
  /** Ya derivado del JWT en el handler — nunca el del body. */
  socioId: string | null;
  socioEmail: string | null;
  /** "Pagar y reservar sin login": la clase concreta que se está pagando. */
  sesionId: string | null;
  // Canje de códigos de descuento (auditoría vs Momence): sin esto en la
  // clave, un reintento con un código distinto (o quitado) reutilizaría el
  // mismo PaymentIntent con el `amount` del primer intento — o Stripe
  // rechazaría el reintento por "parámetros distintos con la misma
  // idempotency key". El id del código, no su texto: dos textos que resuelven
  // al mismo código (mayúsculas/espacios) deben seguir siendo el MISMO
  // intento.
  codigoDescuentoId: string | null;
}

/**
 * Quién paga. El email NO viaja en claro: la clave de idempotencia acaba en los
 * logs de Stripe, y un email es un dato personal.
 */
function quienPaga(socioId: string | null, socioEmail: string | null): string {
  if (socioId) return socioId;
  if (socioEmail) {
    return `e${createHash('sha256').update(socioEmail.trim().toLowerCase()).digest('hex').slice(0, 16)}`;
  }
  return 'guest';
}

// ─────────────────────────────────────────────────────────────────────────────
// D-3 (auditoría 20-ago): la MISMA regla, para la compra de plan del Modo A
// (`app/api/stripe/checkout/route.ts`, Checkout Session). Allí la clave y la
// reserva de sesión existían solo para recibos; la compra de un plan no tenía
// ninguna de las dos — dos pestañas eran dos `cs_` pagables, dos cargos, dos
// recibos COBRADOS y dos suscripciones, y el conciliador tampoco lo detectaba
// (los ids de entrega derivan del id de sesión, que es distinto).
//
// Diferencias deliberadas respecto a `claveCheckoutEmbebido`:
//
//  · PREFIJO PROPIO ('checkout-plan'). El fallback de Bizum del widget llama a
//    este MISMO endpoint después de un intento embebido: con la misma clave en
//    dos llamadas distintas de la API (paymentIntents.create vs
//    checkout.sessions.create), Stripe respondería idempotency_error y esa
//    persona NO PODRÍA PAGAR — el fallo de ventas nº2 de la HISTORIA de
//    arriba, por otra vía.
//
//  · LOS MÉTODOS DE PAGO VAN EN LA CLAVE, como ya hace la clave de recibos del
//    mismo endpoint: pasar de tarjeta a tarjeta+Bizum exige una sesión
//    distinta, y con la misma clave y parámetros distintos Stripe rechaza el
//    intento. El precio es que un cambio de método deja la sesión anterior
//    viva hasta que caduque (aquí no hay fila donde anclar una reserva que
//    permita expirarla, a diferencia del recibo) — pagar las DOS exigiría
//    completar dos checkouts a propósito.
//
//  · SIN IDENTIDAD NO HAY CLAVE (null). Este endpoint es semipúblico y el
//    email no está garantizado: un 'guest' a secas colisionaría entre personas
//    distintas comprando el mismo plan en el mismo minuto. En Modo B se acepta
//    porque su formulario siempre recoge el email antes de cobrar; aquí lo
//    conservador es no arriesgar una venta — sin clave se queda el
//    comportamiento de antes, que ya era el statu quo.
//
// Sin `sesionId`: el Modo A no tiene "pagar y reservar" — siempre es compra
// suelta, así que siempre lleva la ventana de un minuto (repetir la compra de
// un bono SÍ puede ser legítimo). Mismo residuo documentado que Modo B: dos
// pestañas separadas por más de 60 s siguen creando dos sesiones.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosClaveCheckoutPlan {
  studioId: string;
  planId: string;
  socioId: string | null;
  socioEmail: string | null;
  codigoDescuentoId: string | null;
  /** `payment_method_types` de la sesión: cambiarlos exige una sesión distinta. */
  metodos: string[];
}

export function claveCheckoutPlanModoA(
  datos: DatosClaveCheckoutPlan,
  ahoraMs: number = Date.now(),
): string | null {
  if (!datos.socioId && !datos.socioEmail) return null;
  return [
    'checkout-plan',
    datos.studioId,
    datos.planId,
    quienPaga(datos.socioId, datos.socioEmail),
    datos.codigoDescuentoId ? `d${datos.codigoDescuentoId}` : 'dnone',
    [...datos.metodos].sort().join('+'),
    String(Math.floor(ahoraMs / 60000)),
  ].join('-');
}

export function claveCheckoutEmbebido(
  datos: DatosClaveCheckoutEmbebido,
  ahoraMs: number = Date.now(),
): string {
  const partes = [
    // `-v2`: al hacer `setup_future_usage` condicional (P0 del checkout, antes
    // era 'off_session' incondicional), un intento arrancado antes del deploy y
    // reintentado después mandaría la MISMA clave con parámetros distintos — y
    // Stripe rechaza ese reintento legítimo con un error de idempotencia en vez
    // de devolver el PaymentIntent. Versionar la clave hace que el reintento
    // post-deploy sea un intento nuevo (sin doble cobro: el PI del intento
    // viejo nunca llegó a confirmarse, si se hubiera confirmado no habría
    // reintento).
    'checkout-embebido-v2',
    datos.studioId,
    datos.planId,
    quienPaga(datos.socioId, datos.socioEmail),
    datos.codigoDescuentoId ? `d${datos.codigoDescuentoId}` : 'dnone',
  ];
  if (datos.sesionId) {
    // Con clase concreta se ELIMINA el componente temporal: "pagar esta clase
    // con este plan" no es algo que se repita legítimamente, así que dos
    // pestañas comparten clave y Stripe devuelve el MISMO PaymentIntent — que
    // es justo lo que se quiere. También cierra el caso de la misma socia
    // comprando el mismo plan para dos clases distintas, que antes chocaba.
    partes.push(`s${datos.sesionId}`);
  } else {
    // Compra suelta de bono: repetirla SÍ puede ser legítimo (comprar dos
    // bonos), así que se conserva la ventana de un minuto.
    //
    // PENDIENTE (no es un cambio de una línea, ver informe de auditoría):
    // persistir el `payment_intent_id` abierto para reutilizarlo o cancelarlo,
    // como ya hace app/api/stripe/checkout/route.ts con
    // `recibos.checkout_session_id`. Mientras tanto, esta ventana sigue siendo
    // una mitigación parcial para este caso concreto.
    partes.push(String(Math.floor(ahoraMs / 60000)));
  }
  return partes.join('-');
}
