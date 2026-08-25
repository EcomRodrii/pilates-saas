'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function cobrarOnlineAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('cobrarOnlineAction');
}
