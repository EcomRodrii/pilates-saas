import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Comprobaciones de servidor sobre el equipo, compartidas por las rutas de
// seguimientos (app/api/seguimientos): van con service_role, así que lo que la
// RLS no puede comprobar lo comprueban aquí.

/**
 * ¿Esta cuenta es del equipo de este estudio y gestiona clientas? La propietaria
 * (que puede no tener ficha de equipo) o una ficha ACTIVA de propietaria,
 * gerencia o recepción. `null` si no se ha podido leer.
 */
export async function cuentaDelEquipo(admin: SupabaseClient, studioId: string, cuenta: string): Promise<boolean | null> {
  const [estudio, ficha] = await Promise.all([
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
    admin.from('instructores').select('id').eq('studio_id', studioId).eq('auth_user_id', cuenta)
      .eq('activo', true).in('rol', ['PROPIETARIO', 'MANAGER', 'RECEPCION']).limit(1),
  ]);
  if (estudio.error || ficha.error) return null;
  return estudio.data?.owner_auth_user_id === cuenta || (ficha.data?.length ?? 0) > 0;
}
