'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * sociosImport
 *
 * Migrated from: app/api/socios/import/route.ts
 * Domain: socios
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function sociosImport(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from import route
  throw new Error('Not yet implemented - extract from app/api/socios/import/route.ts');
}
