'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

/**
 * Server Action: Aplicar tipos de clase a cadena.
 */
export async function aplicarTiposClaseAction(data: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  if (sesion.rol !== 'PROPIETARIO') throw new Error('Solo propietario');
  return { ok: true };
}
