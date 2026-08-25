'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * stripePosbizum
 *
 * Migrated from: app/api/stripe/pos-bizum/route.ts
 * Domain: stripe
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function stripePosbizum(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from pos-bizum route
  throw new Error('Not yet implemented - extract from app/api/stripe/pos-bizum/route.ts');
}
