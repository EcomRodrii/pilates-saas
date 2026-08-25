'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function enviarGestoriaAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true };
}
