// PAY-2 (62ª pasada). Cancela la suscripción individual que un alta a CADENA
// reemplaza — SOLO una vez que la de cadena ha llegado a un estado real
// (`ESTADOS_VIVOS`, la misma lista que ya usa `checkoutPrevio` para decidir
// "esto ya existe de verdad"). Antes esto se hacía síncronamente en
// /api/billing/checkout, ANTES de crear el Checkout: si la propietaria
// abandonaba la página de pago, se quedaba sin ninguna suscripción — ni la
// vieja (cancelada) ni la nueva (nunca llegó a pagarse).
//
// Se aplaza al webhook de Stripe: el id a cancelar viaja en la metadata de la
// suscripción nueva (`subscription_data.metadata.cancelarSuscripcionAnterior`,
// puesto por /api/billing/checkout), porque para cuando el webhook procesa el
// evento, `studio.subscription_id` ya lo habrá sobrescrito la propia suscripción
// de cadena.
import Stripe from 'stripe';
import { ESTADOS_VIVOS } from './checkout-saas-previo.ts';

/** ¿Hay que intentar cancelar algo, y qué id? `null` = nada que hacer. */
export function idACancelar(sub: { metadata?: Record<string, string> | null; status: string }): string | null {
  const anteriorId = sub.metadata?.cancelarSuscripcionAnterior;
  if (!anteriorId || !ESTADOS_VIVOS.includes(sub.status)) return null;
  return anteriorId;
}

export interface ResultadoCancelacion {
  intentado: boolean;
  /** `undefined` = no había nada que cancelar. `null` = cancelado (o ya lo estaba). */
  errorInesperado?: unknown;
}

/**
 * Idempotente por diseño, no por estado guardado: cada evento de esta misma
 * suscripción (creada, renovada, reactivada) vuelve a intentar cancelar el
 * mismo id. Cancelar una suscripción ya cancelada es un no-op seguro
 * (`resource_missing` — mismo código que ya toleraba el `.catch()` original
 * de esta misma cancelación, auditoría de producto P0-4); solo un error
 * DISTINTO se reporta. Nunca lanza: fallar aquí no puede tirar abajo la
 * actualización de `cadenas`/`studios` que ya se aplicó antes de llamar a esto.
 */
export async function cancelarSuscripcionAnteriorSiToca(
  stripe: Pick<Stripe, 'subscriptions'>,
  sub: { metadata?: Record<string, string> | null; status: string },
): Promise<ResultadoCancelacion> {
  const anteriorId = idACancelar(sub);
  if (!anteriorId) return { intentado: false };
  try {
    await stripe.subscriptions.cancel(anteriorId);
    return { intentado: true };
  } catch (err) {
    const code = err instanceof Stripe.errors.StripeError ? err.code : undefined;
    if (code === 'resource_missing') return { intentado: true };
    return { intentado: true, errorInesperado: err };
  }
}
