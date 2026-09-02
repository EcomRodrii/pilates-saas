'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Devolvía `{ analyzed: true }` sin analizar nada — ni comprobación de rol, ni
 * escritura, ni el motor de decisión (`lib/decision/**`) de por medio. Hoy sin
 * llamantes; falla alto en vez de fingir éxito hasta que se implemente de
 * verdad (17ª auditoría, P-4).
 */
export async function decisionesAnalizarAction() {
  await requireAuthInServerAction();
  return accionSinImplementar('decisiones:analizar');
}
