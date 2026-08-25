'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function comentarComunidadAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('comentarComunidadAction');
}
