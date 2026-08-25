'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function revertirDevolucionAction(devolucionId: string) {
  const sesion = await requireAuthInServerAction();
  if (sesion.rol !== 'PROPIETARIO') throw new Error('Solo propietario');
  return { ok: true };
}
