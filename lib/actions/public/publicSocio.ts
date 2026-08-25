'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * publicSocio
 *
 * Migrated from: app/api/public/socio/route.ts
 * Domain: public
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function publicSocio(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from socio route
  throw new Error('Not yet implemented - extract from app/api/public/socio/route.ts');
}
