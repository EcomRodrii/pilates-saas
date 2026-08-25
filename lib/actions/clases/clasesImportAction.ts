'use server';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

/**
 * clasesImportAction
 *
 * Migrated from: app/api/clases/import/route.ts
 * Domain: clases
 *
 * HTTP Methods supported: POST
 */
export async function clasesImportAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  try {
    // ┌─ TODO: Extract handler logic from import
    // │   Routes: POST /api/clases/import
    // └─ Implementation status: PENDING

    return { ok: true };
  } catch (error) {
    console.error('clasesImportAction:', error);
    throw error;
  }
}
