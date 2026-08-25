'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function aprobarPenalizacionAction(penalizacionId: string) {
  const sesion = await requireAuthInServerAction();
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') throw new Error('No autorizado');
  return { ok: true };
}
