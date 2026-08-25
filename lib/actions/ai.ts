'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function campanaAsistenteAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('campanaAsistenteAction');
}

export async function instructorNoteAction(_data: unknown) {
  await requireAuthInServerAction();
  accionSinImplementar('instructorNoteAction');
}
