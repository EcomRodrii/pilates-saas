'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * reservasOfrecerplazaAction
 * Offers a spot from waiting list
 */

export async function reservasOfrecerplazaAction(_input: {
  sesionId?: string;
  socioId?: string;
}) {
  const sesion = await requireAuthInServerAction();
  
  if (!puedeGestionarCalendario(sesion.rol)) {
    throw new Error('No tienes permiso');
  }

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  // TODO: Implement offer logic
  return { ok: true };
}
