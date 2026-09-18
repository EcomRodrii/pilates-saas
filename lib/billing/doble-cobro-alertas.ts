/**
 * PAY-6: Alertas cuando se detecta doble cobro
 *
 * Emite notificaciones a la propietaria cuando se detectan múltiples cobros
 * exitosos en el mismo recibo. Best-effort: un fallo en la alerta no rompe
 * el flujo de detección.
 */

import { publish } from '@/lib/notifications/engine.ts';
import { EVENTOS } from '@/lib/notifications/catalog.ts';

/**
 * Alerta a la propietaria de un doble cobro detectado.
 * Best-effort: si la notificación falla, se registra en Sentry pero no rompe.
 */
export async function alertarDobleCobroDetectado(
  studioId: string,
  reciboId: string,
  importeCentimos: number,
  intentosExitosos: number,
): Promise<void> {
  try {
    const importe = (importeCentimos / 100).toFixed(2);
    const dedupKey = `doble-cobro:${studioId}:${reciboId}`;

    await publish({
      type: EVENTOS.DOBLE_COBRO_DETECTADO,
      studioId,
      data: {
        reciboId,
        importe,
        intentos: intentosExitosos,
      },
      resource: { type: 'recibo', id: reciboId },
      dedupKey,
    });
  } catch (e) {
    console.error('[billing] alertarDobleCobroDetectado:', e instanceof Error ? e.message : e);
    // Best-effort: no relanzar el error
  }
}
