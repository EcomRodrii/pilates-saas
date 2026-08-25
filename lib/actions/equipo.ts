'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function registrarAusenciaAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true };
}
