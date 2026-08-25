'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * terminalLector
 *
 * Migrated from: app/api/terminal/lector/route.ts
 * Domain: terminal
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function terminalLector(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from lector route
  throw new Error('Not yet implemented - extract from app/api/terminal/lector/route.ts');
}
