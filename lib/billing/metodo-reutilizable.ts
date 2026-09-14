// ─────────────────────────────────────────────────────────────────────────────
// ¿El método con el que se acaba de pagar sirve para volver a cobrar sola?
//
// Existe porque la respuesta dejó de ser una sola condición. Antes el webhook
// preguntaba `pi.payment_method_types.includes('card') && pi.setup_future_usage
// === 'off_session'`, y las DOS mitades se quedaron cortas:
//
//   1. `payment_method_types` es lo que se OFRECIÓ, no lo que se usó. En una
//      sesión con Bizum + tarjeta esa lista incluye 'card' pase lo que pase, así
//      que un pago por Bizum habría guardado un PaymentMethod de Bizum en
//      `socios.stripe_payment_method_id`. El siguiente cobro off-session
//      fallaría con un error de Stripe imposible de entender desde el panel.
//   2. El guardado se pide ahora POR MÉTODO
//      (`payment_method_options.card.setup_future_usage`), porque el global es
//      incompatible con Bizum. Con el global ya no puesto, la comprobación
//      antigua daría "no reutilizable" SIEMPRE y la tarjeta no se guardaría
//      nunca — el bug que veníamos a arreglar, del revés.
//   3. Link (14-sep-2026). El checkout embebido usa `automatic_payment_methods`,
//      así que se puede pagar con Link, y un PaymentMethod `link` guardado con
//      `setup_future_usage` SÍ se cobra después off-session (guía de Stripe «Set
//      up future payments using Elements and Link»: PaymentIntent con
//      `customer`, `payment_method`, `off_session` y `confirm`).
//      `cobrarReciboOffSession` no fija tipos, y desde la API 2023-08-16 eso
//      activa los automáticos, así que ese cobro no necesita cambio. Rechazarlo
//      aquí dejaba la cuota pagada una vez y sin renovación.
//
// Se acepta el `setup_future_usage` global además del por-método: lo siguen
// pidiendo /api/public/checkout-embebido y cualquier PaymentIntent anterior a
// este cambio, y esos siguen siendo válidos.
// ─────────────────────────────────────────────────────────────────────────────

// Forma mínima de lo que se necesita de un PaymentIntent de Stripe. Un tipo
// propio y no el de la librería para que esto se pueda probar sin Stripe.
export interface PaymentIntentReutilizable {
  // string cuando no se expandió; objeto con `type` cuando sí. El objeto es lo
  // que permite saber el método REAL usado.
  payment_method?: string | { id?: string | null; type?: string | null } | null;
  payment_method_types?: string[] | null;
  setup_future_usage?: string | null;
  payment_method_options?: {
    card?: { setup_future_usage?: string | null } | null;
    link?: { setup_future_usage?: string | null } | null;
  } | null;
}

const pedidoGuardar = (pi: PaymentIntentReutilizable, tipo: 'card' | 'link'): boolean =>
  pi.setup_future_usage === 'off_session'
  || pi.payment_method_options?.[tipo]?.setup_future_usage === 'off_session';

const soloTarjetaOfrecida = (pi: PaymentIntentReutilizable): boolean => {
  const ofrecidos = pi.payment_method_types ?? [];
  return ofrecidos.length === 1 && ofrecidos[0] === 'card';
};

// El id del método a guardar, o null si no hay nada reutilizable.
export function metodoReutilizableDe(pi: PaymentIntentReutilizable): string | null {
  const pm = pi.payment_method;
  const pmId = typeof pm === 'string' ? pm : (pm?.id ?? null);
  if (!pmId) return null;

  // Tarjeta o Link, y que se pidiera guardarlo para ESE tipo (el por-método de
  // tarjeta no guarda un Link). Con el PaymentMethod expandido lo sabemos
  // seguro; sin expandir, solo se acepta cuando lo ÚNICO ofrecido era tarjeta
  // (ahí no cabe ambigüedad). En cualquier otro caso, antes de llamar aquí hay
  // que preguntar el tipo real (`hayQueConsultarTipo`): el coste de no guardar
  // es una cuota que no se renueva sola; el de guardar mal, un cobro automático
  // que falla sin que nadie entienda por qué.
  const tipoReal = typeof pm === 'string' ? null : (pm?.type ?? null);
  if (tipoReal !== null) {
    return (tipoReal === 'card' || tipoReal === 'link') && pedidoGuardar(pi, tipoReal) ? pmId : null;
  }
  return soloTarjetaOfrecida(pi) && pedidoGuardar(pi, 'card') ? pmId : null;
}

/**
 * ¿Hace falta preguntarle a Stripe el TIPO del método antes de decidir?
 *
 * Sí cuando se pidió guardar, el método viene sin expandir (el evento
 * `payment_intent.succeeded` y el listado del conciliador lo traen como id) y
 * se ofreció algo más que tarjeta. ⚠️ Con `automatic_payment_methods` (checkout
 * embebido) `payment_method_types` lista TODO lo ofrecido —`['card','link',…]`—
 * y, sin preguntar, no se guardaba ni una tarjeta pagada con tarjeta.
 */
export function hayQueConsultarTipo(pi: PaymentIntentReutilizable): boolean {
  if (typeof pi.payment_method !== 'string') return false;
  if (!pedidoGuardar(pi, 'card') && !pedidoGuardar(pi, 'link')) return false;
  return !soloTarjetaOfrecida(pi);
}
