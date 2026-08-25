'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * aiInstructornote
 *
 * Migrated from: app/api/ai/instructor-note/route.ts
 * Domain: ai
 *
 * TODO: Extract and implement logic from the original API route
 */
export async function aiInstructornote(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from instructor-note route
  throw new Error('Not yet implemented - extract from app/api/ai/instructor-note/route.ts');
}
