'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Devolvía `{ autonomiaEnabled: input.enabled }` — el eco de lo que mandaba el
 * cliente, sin comprobar rol ni escribir nada. Cambiar el modo de autonomía
 * del piloto automático (`lib/decision/autonomia.ts`) no es cosa de cualquier
 * rol. Hoy sin llamantes; falla alto en vez de fingir éxito (17ª auditoría,
 * P-4).
 */
export async function decisionesAutonomiaAction(input: { enabled?: boolean }) {
  await requireAuthInServerAction();
  void input;
  return accionSinImplementar('decisiones:autonomia');
}
