'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Devolvía `{ ok: true }` sin rechazar nada ni comprobar rol. Hoy sin
 * llamantes; falla alto en vez de fingir éxito (17ª auditoría, P-4).
 */
export async function decisionesRechazarAction(input: { id?: string }) {
  await requireAuthInServerAction();
  if (!input.id) throw new Error('Falta id');
  return accionSinImplementar('decisiones:rechazar');
}
