'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function checkinPaseAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('checkinPaseAction');
}
