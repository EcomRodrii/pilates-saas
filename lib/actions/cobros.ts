'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function cobrarOnlineAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true, paymentId: 'pay_' + Date.now() };
}
