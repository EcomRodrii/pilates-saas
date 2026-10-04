// Una sede cuya cadena tiene suscripción viva la gobierna la CADENA: el webhook
// escribe en `cadenas` y el trigger `propagar_plan_cadena` (migr 0066) copia
// plan, estado y fin de periodo a cada sede. Un evento de OTRA suscripción que
// lleve la metadata de la sede —la individual que tenía antes de pasarse a
// CADENA— no puede escribir en esa fila. El caso real es el
// `customer.subscription.deleted` que manda Stripe cuando
// `cancelarSuscripcionAnteriorSiToca` cancela la individual: dejaba la sede
// `canceled` y con su plan viejo mientras la cadena seguía activa, con el panel
// bloqueado (BILLING_ENFORCED) hasta que la cadena volviera a cambiar, que puede
// ser su siguiente renovación.
//
// ⚠️ No vale comparar con `studios.subscription_id`: el trigger NO propaga
// `subscription_id` (ni `subscription_evento_en`), así que la sede sigue
// guardando el id de la individual vieja y la comparación la daría por vigente.
// Tampoco vale «tiene `cadena_id`»: el checkout de CADENA vincula la sede ANTES
// de pagar, y si la propietaria lo abandona, la individual sigue siendo la única
// suscripción que tiene.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADOS_VIVOS } from './checkout-saas-previo.ts';

export interface CadenaDeLaSede {
  subscriptionId: string | null;
  subscriptionStatus: string | null;
}

/**
 * ¿Manda la cadena sobre la sede para un evento de la suscripción `subId`?
 * Misma lista de estados (`ESTADOS_VIVOS`) que decide cancelar la individual:
 * si se canceló, es porque la cadena estaba viva, y su evento se ignora siempre.
 */
export function mandaLaCadena(subId: string, cadena: CadenaDeLaSede | null): boolean {
  if (!cadena) return false;
  // La propia suscripción de la cadena: las migradas en 0066 llevan solo
  // `studioId` en la metadata y comparten cliente con la sede. No es una
  // suscripción desplazada; sigue como estaba.
  if (cadena.subscriptionId === subId) return false;
  return cadena.subscriptionStatus != null && ESTADOS_VIVOS.includes(cadena.subscriptionStatus);
}

/**
 * Lee las sedes a las que iría el evento (por id o por cliente de Stripe) y sus
 * cadenas. `true` = ninguna debe recibirlo: todas tienen una cadena viva que no
 * es la dueña de `subId`. Lanza si la lectura falla: el webhook devuelve 500 y
 * Stripe reintenta, en vez de escribir el estado a ciegas.
 */
export async function desplazadaPorSuCadena(
  admin: Pick<SupabaseClient, 'from'>,
  columna: 'id' | 'stripe_customer_id',
  valor: string,
  subId: string,
): Promise<boolean> {
  const { data: sedes, error } = await admin.from('studios').select('id, cadena_id').eq(columna, valor);
  if (error) throw new Error(`leer sede: ${error.message}`);
  const filas = (sedes ?? []) as { id: string; cadena_id: string | null }[];
  const cadenaIds = [...new Set(filas.map(s => s.cadena_id).filter((id): id is string => Boolean(id)))];
  if (filas.length === 0 || cadenaIds.length === 0) return false;

  const { data: cadenas, error: errorCadenas } = await admin
    .from('cadenas').select('id, subscription_id, subscription_status').in('id', cadenaIds);
  if (errorCadenas) throw new Error(`leer cadena: ${errorCadenas.message}`);
  const porId = new Map(
    ((cadenas ?? []) as { id: string; subscription_id: string | null; subscription_status: string | null }[])
      .map(c => [c.id, { subscriptionId: c.subscription_id, subscriptionStatus: c.subscription_status }]),
  );
  return filas.every(s => s.cadena_id != null && mandaLaCadena(subId, porId.get(s.cadena_id) ?? null));
}
