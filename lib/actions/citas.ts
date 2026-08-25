'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function importarCitasAction(_data: unknown) {
  await requireAuthInServerAction();
  return { ok: true, imported: 0 };
}
