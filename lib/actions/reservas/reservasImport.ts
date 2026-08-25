'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * reservasImport
 *
 * Migrated from: app/api/reservas/import/route.ts
 * Domain: reservas
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function reservasImport(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from import route
  throw new Error('Not yet implemented - extract from app/api/reservas/import/route.ts');
}
