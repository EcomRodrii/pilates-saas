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
import { r2Configurado, trasladarAlBucketUe, trasladoAUePendiente } from '@/lib/r2';
import { copiaSuspendidaPorVencimiento } from '@/lib/retencion/ciclo-estudios-vencidos';
import * as Sentry from '@sentry/nextjs';

/**
 * Estudios sin contrato que ya no se copian (ciclo de
 * lib/retencion/ciclo-estudios-vencidos.ts; ⚠️ plazos pendientes de validación
 * legal): la prueba vencida sin pagar hace ≥ 30 días y el estudio de pago dado
 * de baja, desde el primer día. Si la lectura falla se copia a todos: ante la
 * duda gana la continuidad de datos, y el fallo queda en Sentry.
 */
async function sinCopiaPorVencimiento(admin: SupabaseClient, ahora: Date): Promise<Set<string>> {
  const { data, error } = await fetchAllRows<{
    id: string; trial_ends_at: string | null; subscription_status: string | null;
    subscription_id: string | null; contrato_terminado_en: string | null;
  }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios')
      .select('id, trial_ends_at, subscription_status, subscription_id, contrato_terminado_en')
      .or('subscription_status.eq.trial_expirado,contrato_terminado_en.not.is.null')
      .order('id')
      .range(from, to),
  );
  if (error) {
    Sentry.captureException(new Error(`backups: leyendo estudios vencidos: ${error.message}`), { tags: { area: 'backups' } });
    return new Set();
  }
  return new Set(data
    .filter(s => copiaSuspendidaPorVencimiento(
      {
        trialEndsAt: s.trial_ends_at, subscriptionStatus: s.subscription_status,
        subscriptionId: s.subscription_id, contratoTerminadoEn: s.contrato_terminado_en,
      }, ahora,
    ))
    .map(s => s.id));
}

export async function ejecutarCopiaDiariaDeTodos(): Promise<{
  estudios: number; tipos: TipoBackup[]; fallidos: number; omitidosPorVencimiento: number; sinCifrar: number;
  traslado?: { trasladados: number; yaEstaban: number; fallos: number; quedan: boolean };
}> {
  const admin = getSupabaseAdmin();
  if (!admin) return { estudios: 0, tipos: [], fallidos: 0, omitidosPorVencimiento: 0, sinCifrar: 0 };
  const inicio = Date.now();

  const now = new Date();
  const tipos: TipoBackup[] = ['DIARIO'];
  if (now.getUTCDay() === 1) tipos.push('SEMANAL'); // lunes
  if (now.getUTCDate() === 1) tipos.push('MENSUAL'); // día 1 del mes

  // A diferencia de otros barridos, este NO filtra `suspendido_en` a
  // propósito: los backups son continuidad de datos, no comunicación con las
  // socias — un estudio suspendido por impago puede reactivarse. Lo que sí se
  // excluye es el estudio sin contrato (ver arriba).
  const [studios, vencidos] = await Promise.all([
    idsEstudios(admin, { incluirSuspendidos: true }),
    sinCopiaPorVencimiento(admin, now),
  ]);

  let fallidos = 0;
  let omitidosPorVencimiento = 0;
  let sinCifrar = 0;
  for (const { id: studioId } of studios) {
    try {
      if (vencidos.has(studioId)) {
        omitidosPorVencimiento++;
      } else {
        for (const tipo of tipos) {
          const copia = await guardarBackup(admin, { studioId, tipo });
          if (!copia.cifrada) sinCifrar++;
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
  // El contrato de encargo promete copias cifradas: una noche sin clave se
  // avisa una vez, no por estudio. (Sin R2 la copia va a la propia BD, que
  // Supabase cifra en disco; eso no cuenta aquí.)
  if (sinCifrar > 0 && r2Configurado()) {
    Sentry.captureMessage('backups: copias subidas a R2 sin cifrar (falta BACKUPS_CLAVE_CIFRADO)', {
      level: 'error', tags: { area: 'backups' }, extra: { sinCifrar },
    });
  }

  // Con `R2_BUCKET_UE` puesto, cada noche se mueve un trozo del bucket viejo al
  // de la UE (lib/r2.ts) hasta vaciarlo. Después de las copias, con lo que quede
  // del tiempo de la función (300 s): las copias de hoy mandan.
  let traslado: { trasladados: number; yaEstaban: number; fallos: number; quedan: boolean } | undefined;
  if (trasladoAUePendiente()) {
    try {
      const t = await trasladarAlBucketUe({ limite: 400, hastaMs: Math.min(inicio + 240_000, Date.now() + 150_000) });
      traslado = { trasladados: t.trasladados, yaEstaban: t.yaEstaban, fallos: t.fallos.length, quedan: t.quedan };
      if (t.fallos.length > 0) {
        Sentry.captureMessage('backups: fallos al trasladar objetos al bucket de la UE', {
          level: 'error', tags: { area: 'backups' }, extra: { fallos: t.fallos.slice(0, 20) },
        });
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('traslado al bucket de la UE'), { tags: { area: 'backups' } });
    }
  }
  return { estudios: studios.length, tipos, fallidos, omitidosPorVencimiento, sinCifrar, traslado };
}
