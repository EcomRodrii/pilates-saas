'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function comentarComunidadAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true, commentId: 'cmt_' + Date.now() };
}
