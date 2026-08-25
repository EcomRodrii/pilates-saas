'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * publicTarjeta
 *
 * Migrated from: app/api/public/tarjeta/route.ts
 * Domain: public
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function publicTarjeta(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from tarjeta route
  throw new Error('Not yet implemented - extract from app/api/public/tarjeta/route.ts');
}
