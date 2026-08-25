'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function importarCitasAction(data: unknown) {
  const sesion = await requireAuthInServerAction();
  return { ok: true, imported: 0 };
}
