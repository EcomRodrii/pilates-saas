'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function cobrarOnlineAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true, paymentId: 'pay_' + Date.now() };
}
