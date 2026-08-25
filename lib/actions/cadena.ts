'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

/**
 * Server Action: Aplicar tipos de clase a cadena.
 */
export async function aplicarTiposClaseAction(_data: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  if (sesion.rol !== 'PROPIETARIO') throw new Error('Solo propietario');
  accionSinImplementar('aplicarTiposClaseAction');
}
