'use server';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

/**
 * decisionesAction
 *
 * Migrated from: app/api/decisiones/route.ts
 * Domain: decisiones
 *
 * HTTP Methods supported: GET
 */
export async function decisionesAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  try {
    // ┌─ TODO: Extract handler logic from decisiones
    // │   Routes: GET /api/decisiones
    // └─ Implementation status: PENDING

    return { ok: true };
  } catch (error) {
    console.error('decisionesAction:', error);
    throw error;
  }
}
