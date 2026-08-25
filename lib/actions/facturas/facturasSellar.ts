'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * facturasSellar
 *
 * Migrated from: app/api/facturas/sellar/route.ts
 * Domain: facturas
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function facturasSellar(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from sellar route
  throw new Error('Not yet implemented - extract from app/api/facturas/sellar/route.ts');
}
