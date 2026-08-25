'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function comentarComunidadAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true, commentId: 'cmt_' + Date.now() };
}
