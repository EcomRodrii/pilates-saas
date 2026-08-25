'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * ingresos-manuales
 *
 * Migrated from: app/api/ingresos-manuales/route.ts
 * Domain: ingresos-manuales
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function ingresosManuales(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from ingresos-manuales route
  throw new Error('Not yet implemented - extract from app/api/ingresos-manuales/route.ts');
}
