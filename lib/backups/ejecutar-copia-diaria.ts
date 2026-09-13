// ─────────────────────────────────────────────────────────────────────────────
// Backups — copia de seguridad diaria de cada estudio.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A).
// El fan-out por estudio de Inngest se colapsa en un bucle simple — con ~10
// estudios y sin llamadas externas pesadas, no hace falta una cola con
// reintentos por-tenant; un fallo de un estudio se registra y se sigue con
// los demás.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { fetchAllRows } from '@/lib/supabase-data';
import { guardarBackup, podarBackupsAntiguos, type TipoBackup } from '@/lib/engines/backup-engine';
import { copiaSuspendidaPorVencimiento } from '@/lib/retencion/ciclo-estudios-vencidos';
import * as Sentry from '@sentry/nextjs';

/**
 * Estudios cuya prueba venció sin pagar hace ≥ 30 días: ya no se copian
 * (ciclo de lib/retencion/ciclo-estudios-vencidos.ts; ⚠️ plazo pendiente de
 * validación legal). Si la lectura falla se copia a todos: ante la duda gana la
 * continuidad de datos, y el fallo queda en Sentry.
 */
async function sinCopiaPorVencimiento(admin: SupabaseClient, ahora: Date): Promise<Set<string>> {
  const { data, error } = await fetchAllRows<{ id: string; trial_ends_at: string | null; subscription_status: string | null; subscription_id: string | null }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios')
      .select('id, trial_ends_at, subscription_status, subscription_id')
      .eq('subscription_status', 'trial_expirado')
      .order('id')
      .range(from, to),
  );
  if (error) {
    Sentry.captureException(new Error(`backups: leyendo estudios vencidos: ${error.message}`), { tags: { area: 'backups' } });
    return new Set();
  }
  return new Set(data
    .filter(s => copiaSuspendidaPorVencimiento(
      { trialEndsAt: s.trial_ends_at, subscriptionStatus: s.subscription_status, subscriptionId: s.subscription_id }, ahora,
    ))
    .map(s => s.id));
}

export async function ejecutarCopiaDiariaDeTodos(): Promise<{
  estudios: number; tipos: TipoBackup[]; fallidos: number; omitidosPorVencimiento: number;
}> {
  const admin = getSupabaseAdmin();
  if (!admin) return { estudios: 0, tipos: [], fallidos: 0, omitidosPorVencimiento: 0 };

  const now = new Date();
  const tipos: TipoBackup[] = ['DIARIO'];
  if (now.getUTCDay() === 1) tipos.push('SEMANAL'); // lunes
  if (now.getUTCDate() === 1) tipos.push('MENSUAL'); // día 1 del mes

  // A diferencia de otros barridos, este NO filtra `suspendido_en` a
  // propósito: los backups son continuidad de datos, no comunicación con las
  // socias — un estudio suspendido por impago puede reactivarse. Lo que sí se
  // excluye es la prueba vencida sin pagar pasados 30 días (ver arriba).
  const [studios, vencidos] = await Promise.all([
    idsEstudios(admin, { incluirSuspendidos: true }),
    sinCopiaPorVencimiento(admin, now),
  ]);

  let fallidos = 0;
  let omitidosPorVencimiento = 0;
  for (const { id: studioId } of studios) {
    try {
      if (vencidos.has(studioId)) {
        omitidosPorVencimiento++;
      } else {
        for (const tipo of tipos) {
          await guardarBackup(admin, { studioId, tipo });
          await podarBackupsAntiguos(admin, studioId, tipo);
        }
      }
      // Las manuales caducan por FECHA: su poda solo corría al crear otra
      // manual, así que un estudio que no vuelve a hacer ninguna las guardaba
      // para siempre. Una consulta por estudio, cada noche.
      await podarBackupsAntiguos(admin, studioId, 'MANUAL');
    } catch (e) {
      fallidos++;
      Sentry.captureException(e instanceof Error ? e : new Error('backup diario'), {
        level: 'error', tags: { area: 'backups' }, extra: { studioId },
      });
    }
  }
  return { estudios: studios.length, tipos, fallidos, omitidosPorVencimiento };
}
