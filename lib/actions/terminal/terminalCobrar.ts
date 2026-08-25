'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * terminalCobrar
 *
 * Migrated from: app/api/terminal/cobrar/route.ts
 * Domain: terminal
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function terminalCobrar(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from cobrar route
  throw new Error('Not yet implemented - extract from app/api/terminal/cobrar/route.ts');
}
