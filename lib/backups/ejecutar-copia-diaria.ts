// ─────────────────────────────────────────────────────────────────────────────
// Backups — copia de seguridad diaria de cada estudio.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A).
// El fan-out por estudio de Inngest se colapsa en un bucle simple — con ~10
// estudios y sin llamadas externas pesadas, no hace falta una cola con
// reintentos por-tenant; un fallo de un estudio se registra y se sigue con
// los demás.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { guardarBackup, podarBackupsAntiguos, type TipoBackup } from '@/lib/engines/backup-engine';
import * as Sentry from '@sentry/nextjs';

export async function ejecutarCopiaDiariaDeTodos(): Promise<{ estudios: number; tipos: TipoBackup[]; fallidos: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { estudios: 0, tipos: [], fallidos: 0 };

  const now = new Date();
  const tipos: TipoBackup[] = ['DIARIO'];
  if (now.getUTCDay() === 1) tipos.push('SEMANAL'); // lunes
  if (now.getUTCDate() === 1) tipos.push('MENSUAL'); // día 1 del mes

  // A diferencia de otros barridos, este NO filtra `suspendido_en` a
  // propósito: los backups son continuidad de datos, no comunicación con las
  // socias — un estudio suspendido por impago puede reactivarse.
  const studios = await idsEstudios(admin, { incluirSuspendidos: true });

  let fallidos = 0;
  for (const { id: studioId } of studios) {
    try {
      for (const tipo of tipos) {
        await guardarBackup(admin, { studioId, tipo });
        await podarBackupsAntiguos(admin, studioId, tipo);
      }
    } catch (e) {
      fallidos++;
      Sentry.captureException(e instanceof Error ? e : new Error('backup diario'), {
        level: 'error', tags: { area: 'backups' }, extra: { studioId },
      });
    }
  }
  return { estudios: studios.length, tipos, fallidos };
}
