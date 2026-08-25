'use server';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

/**
 * equipoRendimientoAction
 *
 * Migrated from: app/api/equipo/rendimiento/route.ts
 * Domain: equipo
 *
 * HTTP Methods supported: GET
 */
export async function equipoRendimientoAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  try {
    // ┌─ TODO: Extract handler logic from rendimiento
    // │   Routes: GET /api/equipo/rendimiento
    // └─ Implementation status: PENDING

    return { ok: true };
  } catch (error) {
    console.error('equipoRendimientoAction:', error);
    throw error;
  }
}
