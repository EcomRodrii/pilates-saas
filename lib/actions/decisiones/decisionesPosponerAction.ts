'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
export async function decisionesPosponerAction(input: { id?: string }) {
  await requireAuthInServerAction();
  if (!input.id) throw new Error('Falta id');
  return { ok: true };
}
