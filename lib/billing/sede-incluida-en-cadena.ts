// Una sede de una cadena con suscripción viva ya la paga la CADENA: el webhook
// escribe en `cadenas` y los triggers de la migr 0066 (`heredar_plan_de_cadena`
// al crearla, `propagar_plan_cadena` después) le copian plan y estado. Lo que no
// le copian es `subscription_id`, así que una sede añadida a una cadena que ya
// paga tiene estado vivo y `subscription_id` NULL. El guard de la rama
// individual de /api/billing/checkout (`subscription_id && suscripcionActiva`)
// la dejaba pasar y abría un Checkout de plan BASE/ESTUDIO encima de la cadena:
// dos suscripciones cobrando por la misma sede. `consultarCheckoutPrevio`
// tampoco lo veía, porque pregunta a Stripe por el cliente de la SEDE y la
// suscripción vive en el de la cadena. Solo lo frenaba la UI de /suscripcion.
//
// ⚠️ No vale «tiene `cadena_id`»: el checkout de CADENA vincula la sede ANTES de
// pagar, y si se abandona, la sede no tiene más plan que el individual que
// contrate. Cuenta el estado de la cadena, con la misma lista (`ESTADOS_VIVOS`)
// con la que el webhook la da por viva.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADOS_VIVOS } from './checkout-saas-previo.ts';

export const MENSAJE_SEDE_INCLUIDA_EN_CADENA =
  'Esta sede ya está incluida en el plan de tu cadena, así que no necesita un plan propio.';

/** ¿La suscripción de la cadena cubre ya a sus sedes? */
export function cadenaPagaSusSedes(estadoCadena: string | null | undefined): boolean {
  return estadoCadena != null && ESTADOS_VIVOS.includes(estadoCadena);
}

/**
 * ¿Esta sede está ya pagada por su cadena? Sin cadena, no. Lanza si la lectura
 * falla: sin saberlo no se abre un Checkout que podría ser un segundo cobro.
 */
export async function sedeIncluidaEnSuCadena(
  admin: Pick<SupabaseClient, 'from'>,
  cadenaId: string | null,
): Promise<boolean> {
  if (!cadenaId) return false;
  const { data, error } = await admin.from('cadenas').select('subscription_status').eq('id', cadenaId).maybeSingle();
  if (error) throw new Error(`leer cadena: ${error.message}`);
  return cadenaPagaSusSedes((data as { subscription_status: string | null } | null)?.subscription_status);
}
