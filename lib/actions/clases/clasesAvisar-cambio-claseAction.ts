'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * clasesAvisar-cambio-claseAction
 *
 * Migrated from: app/api/clases/avisar-cambio-clase/route.ts
 * Domain: clases
 *
 * HTTP Methods supported: POST
 */
export async function clasesAvisarCambioClaseAction(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  try {
    // ┌─ TODO: Extract handler logic from avisar-cambio-clase
    // │   Routes: POST /api/clases/avisar-cambio-clase
    // └─ Implementation status: PENDING

    return { ok: true };
  } catch (error) {
    console.error('clasesAvisar-cambio-claseAction:', error);
    throw error;
  }
}
