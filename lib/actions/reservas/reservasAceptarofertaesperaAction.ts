'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * reservasAceptarofertaesperaAction
 * Accept a waiting list spot offer
 */

export async function reservasAceptarofertaesperaAction(input: {
  reservaId?: string;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  if (!input?.reservaId) throw new Error('Falta reservaId');

  // TODO: Implement acceptance logic
  return { ok: true };
}
