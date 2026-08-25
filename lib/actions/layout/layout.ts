'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * layout
 *
 * Migrated from: app/api/layout/route.ts
 * Domain: layout
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function layout(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from layout route
  throw new Error('Not yet implemented - extract from app/api/layout/route.ts');
}
