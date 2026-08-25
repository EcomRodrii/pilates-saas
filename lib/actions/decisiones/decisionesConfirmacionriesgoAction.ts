'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
export async function decisionesConfirmacionriesgoAction(input: { sesionId?: string; aprobar?: boolean }) {
  await requireAuthInServerAction();
  if (!input.sesionId) throw new Error('Falta sesionId');
  return { ok: true };
}
