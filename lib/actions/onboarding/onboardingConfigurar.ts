'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * onboardingConfigurar
 *
 * Migrated from: app/api/onboarding/configurar/route.ts
 * Domain: onboarding
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function onboardingConfigurar(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from configurar route
  throw new Error('Not yet implemented - extract from app/api/onboarding/configurar/route.ts');
}
