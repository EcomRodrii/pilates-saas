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
  payment_method_options?: { card?: { setup_future_usage?: string | null } | null } | null;
}

// El id del método a guardar, o null si no hay nada reutilizable.
export function metodoReutilizableDe(pi: PaymentIntentReutilizable): string | null {
  const pm = pi.payment_method;
  const pmId = typeof pm === 'string' ? pm : (pm?.id ?? null);
  if (!pmId) return null;

  // Se pidió guardarlo, en cualquiera de las dos formas.
  const pedidoGlobal = pi.setup_future_usage === 'off_session';
  const pedidoPorTarjeta = pi.payment_method_options?.card?.setup_future_usage === 'off_session';
  if (!pedidoGlobal && !pedidoPorTarjeta) return null;

  // Y es de verdad una tarjeta. Con el PaymentMethod expandido lo sabemos
  // seguro; sin expandir, solo se acepta cuando lo ÚNICO ofrecido era tarjeta
  // (ahí no cabe ambigüedad). Si se ofreció Bizum y no tenemos el tipo real,
  // preferimos no guardar nada antes que guardar un método que no sirve: el
  // coste de no guardar es pedirle la tarjeta otra vez; el de guardar mal es un
  // cobro automático que falla sin que nadie entienda por qué.
  const tipoReal = typeof pm === 'string' ? null : (pm?.type ?? null);
  if (tipoReal !== null) return tipoReal === 'card' ? pmId : null;

  const ofrecidos = pi.payment_method_types ?? [];
  return ofrecidos.length === 1 && ofrecidos[0] === 'card' ? pmId : null;
}
