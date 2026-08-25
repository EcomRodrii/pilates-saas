'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function checkinPaseAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true };
}
