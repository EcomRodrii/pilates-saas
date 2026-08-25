'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * integrationsGooglecalendarDisconnect
 *
 * Migrated from: app/api/integrations/google-calendar/disconnect/route.ts
 * Domain: integrations
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function integrationsGooglecalendarDisconnect(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from disconnect route
  throw new Error('Not yet implemented - extract from app/api/integrations/google-calendar/disconnect/route.ts');
}
