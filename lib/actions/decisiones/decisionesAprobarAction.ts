'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Devolvía `{ ok: true }` sin tocar la base de datos ni comprobar rol — el
 * día que se conectara, un INSTRUCTOR habría podido "aprobar" decisiones del
 * Decision OS. Hoy sin llamantes; falla alto en vez de fingir éxito (17ª
 * auditoría, P-4).
 */
export async function decisionesAprobarAction(input: { id?: string }) {
  await requireAuthInServerAction();
  if (!input.id) throw new Error('Falta id');
  return accionSinImplementar('decisiones:aprobar');
}
