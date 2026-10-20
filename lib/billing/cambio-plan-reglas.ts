// Pasar de Founding Studio a Estudio sin pasar por el portal de Stripe
// (19-oct-2026). El portal no cambia el plan de una suscripción con varias
// líneas, y desde los complementos una Founding puede tener hasta cuatro (el plan
// y un complemento por línea). Puro (lo prueba `node --test`); lo aplica
// `app/api/billing/cambiar-plan/route.ts`.
//
// Solo hacia Estudio: es el único cambio que el portal no puede hacer. Bajar de
// Estudio a Founding es una suscripción de una línea y el portal lo hace solo;
// Cadena es otra suscripción (la de la cadena) y va por el checkout.
import type { EstudioConPlan, Plan } from './entitlements.ts';

export type MotivoNoCambioPlan = 'cadena' | 'sin-suscripcion' | 'impago' | 'ya-lo-tiene' | 'destino' | 'baja-programada' | 'revisar';

export const MENSAJE_NO_CAMBIO_PLAN: Record<MotivoNoCambioPlan, string> = {
  cadena: 'Tu sede va con el plan Cadena: el plan se cambia desde la sede principal.',
  'sin-suscripcion': 'Primero elige tu plan.',
  impago: 'Tu último cobro no ha salido. Cuando esté al día podrás cambiar de plan.',
  'ya-lo-tiene': 'Ya tienes ese plan.',
  destino: 'Desde aquí solo se puede pasar a Estudio. Para otros cambios, usa «Facturas, tarjeta y cambio de plan».',
  // La diferencia iría a una factura que nunca llega: antes se reactiva.
  'baja-programada': 'Tienes la baja programada. Reactiva tu suscripción en «Facturas, tarjeta y cambio de plan» y vuelve a intentarlo.',
  revisar: 'Tu suscripción tiene algo que no esperábamos. Escríbenos y te cambiamos de plan a mano.',
};

/** Lo que dice la fila del estudio (la ruta lo vuelve a comprobar contra Stripe). */
export function motivoNoCambioPlan(
  studio: EstudioConPlan & { cadenaId?: string | null; subscriptionId?: string | null },
  destino: unknown,
): MotivoNoCambioPlan | null {
  if (destino !== 'ESTUDIO') return 'destino';
  if (studio.cadenaId) return 'cadena';
  if (!studio.subscriptionId) return 'sin-suscripcion';
  if (studio.subscriptionStatus === 'past_due') return 'impago';
  if (studio.subscriptionStatus !== 'active' && studio.subscriptionStatus !== 'trialing') return 'sin-suscripcion';
  if (studio.plan === 'ESTUDIO') return 'ya-lo-tiene';
  if (studio.plan !== 'BASE') return 'destino';
  return null;
}

export interface LineaParaCambio { id: string; priceId: string | null | undefined }

export type ItemCambio = { id: string; price: string } | { id: string; deleted: true };

/**
 * Las líneas de la suscripción tal como quedan tras el cambio, en UNA sola
 * actualización de Stripe: la línea del plan pasa al precio de Estudio y las de
 * complemento se borran (Estudio ya los incluye; si se quedaran, seguirían
 * cobrando aparte). `null` si la suscripción no es de Founding (lo manda Stripe,
 * no la fila, que puede ir por detrás del webhook) o si tiene una línea que no
 * es ni el plan ni un complemento (añadida a mano): seguiría cobrando aparte
 * tras el cambio, así que no se toca y se revisa a mano.
 */
export function itemsParaPasarAEstudio(
  lineas: readonly LineaParaCambio[],
  precioEstudio: string,
  mapa: { plan: (priceId: string | null | undefined) => Plan | null; esAddon: (priceId: string | null | undefined) => boolean },
): ItemCambio[] | null {
  const planes = lineas.filter((l) => mapa.plan(l.priceId));
  if (planes.length !== 1 || mapa.plan(planes[0].priceId) !== 'BASE') return null;
  if (lineas.some((l) => !mapa.plan(l.priceId) && !mapa.esAddon(l.priceId))) return null;
  const items: ItemCambio[] = [{ id: planes[0].id, price: precioEstudio }];
  for (const l of lineas) if (mapa.esAddon(l.priceId)) items.push({ id: l.id, deleted: true });
  return items;
}
