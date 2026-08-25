'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * clasesAvisarcreadaporinstructorAction
 * Notify when instructor creates class
 */

export async function clasesAvisarcreadaporinstructorAction(input: {
  sesionId?: string;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  if (!input?.sesionId) throw new Error('Falta sesionId');

  // TODO: Notify about instructor-created class
  return { notified: true };
}
