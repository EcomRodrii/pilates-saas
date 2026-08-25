'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function campanaAsistenteAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true };
}

export async function instructorNoteAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true };
}
