'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function enviarGestoriaAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true };
}
