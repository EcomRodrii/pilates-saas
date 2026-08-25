'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function campanaAsistenteAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true };
}

export async function instructorNoteAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true };
}
