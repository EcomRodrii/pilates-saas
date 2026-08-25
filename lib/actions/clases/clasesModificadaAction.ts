'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

/**
 * clasesModificadaAction
 * Notify when class is modified
 */

export async function clasesModificadaAction() {
  const _sesion = await requireAuthInServerAction();
  // TODO: Implement modified notification
  return { notified: true };
}
