'use server';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

/**
 * clasesAvisar-cambio-claseAction
 *
 * Migrated from: app/api/clases/avisar-cambio-clase/route.ts
 * Domain: clases
 *
 * HTTP Methods supported: POST
 */
export async function clasesAvisar-cambio-claseAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
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
