// ─────────────────────────────────────────────────────────────────────────────
// Bizum del mostrador rechazado: cerrar el QR ANTES de anular la venta.
//
// El cobro por Bizum del TPV es una Checkout Session (lib/pos/terminal.ts). Un
// rechazo (`payment_intent.payment_failed`) NO la cierra: la página de pago
// sigue abierta y deja reintentar con otra tarjeta durante los 30 minutos del
// enlace. Pero el webhook anulaba la venta en ese mismo momento, y el TPV le
// decía a la recepcionista «No se ha completado el cobro. No se ha cobrado
// nada», con un botón «Probar otra vez». Si ella cobraba en efectivo y la
// clienta reintentaba en el móvil, pagaba DOS veces (la segunda acababa en
// `reconciliaciones_pos` como cobro sobre venta anulada).
//
// Regla: la venta solo se anula cuando el QR ya no puede cobrarse. Se expira la
// sesión; si Stripe se niega, se mira cómo está: caducada → se anula; pagada o
// sin saberlo → NO. Lo que dice el TPV y lo que permite Stripe tienen que
// coincidir.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo del cliente de Stripe que hace falta (testeable con un doble). */
export interface ClienteSesionesCheckout {
  checkout: {
    sessions: {
      list(p: { payment_intent: string; limit: number }, o: { stripeAccount: string }): Promise<{ data: { id: string; status: string | null }[] }>;
      expire(id: string, p: undefined, o: { stripeAccount: string }): Promise<{ status: string | null }>;
      retrieve(id: string, p: undefined, o: { stripeAccount: string }): Promise<{ status: string | null }>;
    };
  };
}

/**
 * - `cerrada`: el QR ya no puede cobrarse → se puede anular.
 * - `pagada`: la sesión se completó entre el rechazo y ahora → NO anular (el
 *   `payment_intent.succeeded` cerrará la venta).
 * - `sin-sesion`: el PI no sale de ninguna Checkout Session → NO anular; el
 *   sondeo del mostrador o el conciliador lo resolverán cuando haya certeza.
 * - `no-se-sabe`: Stripe no ha contestado → reintentar el evento (5xx).
 */
export type ResultadoCierre = 'cerrada' | 'pagada' | 'sin-sesion' | 'no-se-sabe';

export async function cerrarCheckoutDeBizumFallido(
  stripe: ClienteSesionesCheckout,
  paymentIntentId: string,
  stripeAccount: string,
): Promise<ResultadoCierre> {
  let sesionId: string;
  try {
    const { data } = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 }, { stripeAccount });
    if (!data[0]) return 'sin-sesion';
    if (data[0].status === 'expired') return 'cerrada';
    if (data[0].status === 'complete') return 'pagada';
    sesionId = data[0].id;
  } catch {
    return 'no-se-sabe';
  }

  try {
    const r = await stripe.checkout.sessions.expire(sesionId, undefined, { stripeAccount });
    if (r.status === 'expired') return 'cerrada';
  } catch {
    // Stripe no deja expirar una sesión ya completada o ya caducada: se
    // pregunta cuál de las dos es, en vez de suponerlo.
  }
  try {
    const s = await stripe.checkout.sessions.retrieve(sesionId, undefined, { stripeAccount });
    if (s.status === 'expired') return 'cerrada';
    if (s.status === 'complete') return 'pagada';
  } catch { /* cae abajo */ }
  return 'no-se-sabe';
}

/**
 * QR de Bizum del mostrador que CADUCÓ sin pagarse: su venta (o su recibo)
 * tiene que soltarse. Lo haría `checkout.session.expired`, pero producción no
 * está suscrita a ese evento (21-sep-2026), y el sondeo del TPV solo vigila
 * 90 s: una recepcionista que cierra la hoja sin pulsar «Cancelar» dejaba la
 * venta en PENDIENTE_PAGO, con el stock reservado, para siempre. Lo recoge el
 * conciliador horario.
 */
export function cobroPosDeSesionCaducada(s: {
  id: string;
  status: string | null;
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null | undefined;
}): { metadata: { ventaId?: string; reciboId?: string }; paymentIntentId: string | null; checkoutSessionId: string } | null {
  if (s.status !== 'expired') return null;
  const md = s.metadata ?? {};
  if (md.origen !== 'pos_bizum' || (!md.ventaId && !md.reciboId)) return null;
  const paymentIntentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
  return {
    metadata: md.ventaId ? { ventaId: md.ventaId } : { reciboId: md.reciboId },
    paymentIntentId,
    checkoutSessionId: s.id,
  };
}
