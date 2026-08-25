'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function registrarAusenciaAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('registrarAusenciaAction');
}
