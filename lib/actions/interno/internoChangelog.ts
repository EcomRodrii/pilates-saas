'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * internoChangelog
 *
 * Migrated from: app/api/interno/changelog/route.ts
 * Domain: interno
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function internoChangelog(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from changelog route
  throw new Error('Not yet implemented - extract from app/api/interno/changelog/route.ts');
}
