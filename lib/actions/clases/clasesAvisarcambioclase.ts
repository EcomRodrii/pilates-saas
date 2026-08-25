'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * clasesAvisarcambioclase
 *
 * Migrated from: app/api/clases/avisar-cambio-clase/route.ts
 * Domain: clases
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function clasesAvisarcambioclase(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from avisar-cambio-clase route
  throw new Error('Not yet implemented - extract from app/api/clases/avisar-cambio-clase/route.ts');
}
