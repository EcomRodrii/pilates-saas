'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * authOtpVerificar
 *
 * Migrated from: app/api/auth/otp/verificar/route.ts
 * Domain: auth
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function authOtpVerificar(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from verificar route
  throw new Error('Not yet implemented - extract from app/api/auth/otp/verificar/route.ts');
}
