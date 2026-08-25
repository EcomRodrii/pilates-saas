'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * sustitucionesPedirdisponibilidad
 *
 * Migrated from: app/api/sustituciones/pedir-disponibilidad/route.ts
 * Domain: sustituciones
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function sustitucionesPedirdisponibilidad(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from pedir-disponibilidad route
  throw new Error('Not yet implemented - extract from app/api/sustituciones/pedir-disponibilidad/route.ts');
}
