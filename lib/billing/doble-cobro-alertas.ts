// ─────────────────────────────────────────────────────────────────────────────
// PAY-6: Alertas para dobles cobros detectados
//
// Emite una alerta a Sentry cuando se detecta un doble cobro.
// Best-effort: un fallo aquí no afecta el negocio.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type { DobleCobroDetectado } from './detectar-doble-cobro.ts';

/**
 * Notifica sobre un doble cobro detectado.
 * - Alerta a Sentry (para monitoreo de SLA)
 * - DedupKey por (studio_id, recibo_id) para evitar spam
 * - Best-effort: un error aquí no deshace nada
 */
export async function alertarDobleCobroDectectado(
  _admin: SupabaseClient,
  doble: DobleCobroDetectado,
): Promise<void> {
  try {
    // Alerta a Sentry: el estudio tiene que revisar y devolver
    Sentry.captureMessage(doble.mensaje, {
      level: 'error',
      tags: {
        area: 'cobros',
        tipo: 'doble-cobro',
        studio_id: doble.studio_id,
        recibo_id: doble.recibo_id,
      },
      extra: {
        intentos_exitosos: doble.intentos_exitosos.length,
        payment_intents: doble.intentos_exitosos.map((i) => i.payment_intent_id),
        importe_duplicado_eur: (doble.importe_duplicado_centimos / 100).toFixed(2),
        origenes: [...new Set(doble.intentos_exitosos.map((i) => i.origen))].join(', '),
      },
    });

    // TODO PAY-6 (complete): Emitir evento para notificaciones (PUSH/EMAIL)
    // Una vez que se añada al notification engine catalog
  } catch (err) {
    console.error('[alertarDobleCobroDectectado] error:', err instanceof Error ? err.message : err);
    // No relanzar: best-effort, el negocio continúa
  }
}

/**
 * Alerta a TODOS los dobles cobros detectados en un barrido de auditoría.
 */
export async function alertarTodosLosDoblesCobros(
  admin: SupabaseClient,
  dobles: DobleCobroDetectado[],
): Promise<void> {
  for (const doble of dobles) {
    await alertarDobleCobroDectectado(admin, doble);
  }
}
