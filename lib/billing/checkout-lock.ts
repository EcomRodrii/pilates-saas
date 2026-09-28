// PAY-3 (auditoría 62ª pasada). Cerrojo de una fila por estudio/cadena contra
// dos peticiones casi simultáneas a /api/billing/checkout — ver el comentario
// largo en la migración `pay3_billing_checkout_lock`.
//
// FAIL-CLOSED, al contrario que `webhook-idempotencia.ts`: ahí un error de RPC
// devuelve "reclamado" porque el handler es idempotente y SALTARSE un pago no
// lo sería. Aquí es al revés — si no se puede verificar el cerrojo, no se sabe
// si hay otra petición en vuelo, y crear una Checkout Session sin saberlo es
// exactamente el riesgo que esto existe para evitar. Peor caso: un fallo
// transitorio de la RPC hace que una propietaria tenga que reintentar el pago.

import type { SupabaseClient } from '@supabase/supabase-js';

export const claveCheckoutLock = (tipo: 'studio' | 'cadena', id: string): string => `${tipo}:${id}`;

export async function reclamarCheckoutLock(
  admin: SupabaseClient,
  clave: string,
  expiraSegundos = 30,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('reclamar_checkout_lock', {
      p_clave: clave,
      p_expira_segundos: expiraSegundos,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

// Liberar es best-effort: si falla, el cerrojo se libera solo pasados los
// `expiraSegundos` — un reintento nunca se queda bloqueado para siempre.
export async function liberarCheckoutLock(admin: SupabaseClient, clave: string): Promise<void> {
  try {
    await admin.rpc('liberar_checkout_lock', { p_clave: clave });
  } catch {
    /* no-op */
  }
}
