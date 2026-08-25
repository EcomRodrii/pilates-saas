'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * clasesAvisarchangoclaseAction
 * Notify changes to class
 */

export async function clasesAvisarchangoclaseAction(input: {
  sesionId?: string;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  if (!input?.sesionId) throw new Error('Falta sesionId');

  // TODO: Notify about class changes
  return { notified: true };
}
