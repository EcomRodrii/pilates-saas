'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Devolvía `{ ok: true }` sin tocar la sesión de riesgo de plantón
 * (`confirmacion-riesgo`) ni comprobar rol. Hoy sin llamantes; falla alto en
 * vez de fingir éxito (17ª auditoría, P-4).
 */
export async function decisionesConfirmacionriesgoAction(input: { sesionId?: string; aprobar?: boolean }) {
  await requireAuthInServerAction();
  if (!input.sesionId) throw new Error('Falta sesionId');
  return accionSinImplementar('decisiones:confirmacion-riesgo');
}
