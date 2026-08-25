'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function revertirDevolucionAction(_devolucionId: string) {
  const sesion = await requireAuthInServerAction();
  if (sesion.rol !== 'PROPIETARIO') throw new Error('Solo propietario');
  accionSinImplementar('revertirDevolucionAction');
}
