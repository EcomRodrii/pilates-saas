// Backups — copia de seguridad diaria de cada estudio. Mismo patrón durable que
// dunning/valoraciones (dispatcher cron → fan-out de un evento por estudio →
// worker por estudio).
//
// Antes esto era un route de Vercel Cron (/api/cron/backups) que iteraba TODOS
// los estudios × tipos EN SERIE dentro de una sola invocación acotada a
// maxDuration=300 (su propio comentario lo marcaba como "P0-37: parche hasta
// tener la cola (P0-36)… mientras cada backup no se descompone en jobs por-tenant").
// A cientos de estudios el barrido se pasaba del límite y moría a medias, y el
// fallo o la lentitud de un estudio arrastraba a los demás. Con el fan-out cada
// estudio es un job aislado con reintentos propios y concurrencia acotada.
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from './estudios.ts';
import { guardarBackup, podarBackupsAntiguos, type TipoBackup } from '@/lib/engines/backup-engine';

// Dispatcher: diario a las 03:00 UTC (mismo minuto que tenía el Vercel Cron). Los
// crons de Inngest corren en UTC, así que el día de la semana/mes se calcula con
// getUTC* — a las 03:00 UTC coincide con el criterio que usaba el runtime de Vercel
// (también UTC), preservando exactamente qué días se hace SEMANAL/MENSUAL.
export const backupsDispatcher = inngest.createFunction(
  { id: 'backups-dispatcher', triggers: [{ cron: '0 3 * * *' }] },
  async ({ step }) => {
    const { nowISO, tipos } = await step.run('tipos-del-dia', async () => {
      const now = new Date();
      const t: TipoBackup[] = ['DIARIO'];
      if (now.getUTCDay() === 1) t.push('SEMANAL'); // lunes
      if (now.getUTCDate() === 1) t.push('MENSUAL'); // día 1 del mes
      return { nowISO: now.toISOString(), tipos: t };
    });

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // A diferencia del resto de dispatchers, este NO filtra `suspendido_en`
      // a propósito: los backups son continuidad de datos, no comunicación
      // con las socias — un estudio suspendido por impago puede reactivarse,
      // y frenar sus backups cambia el perfil de riesgo de pérdida de datos
      // sin relación con el motivo real de la suspensión.
      return idsEstudios(admin, { incluirSuspendidos: true });
    });

    await enviarFanOutEnLotes(step, 'fan-out-backups', EVENTS.BACKUPS_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, tipos }));
    return { estudios: studios.length, tipos, ejecutadoEn: nowISO };
  },
);

// Worker: un run por estudio. Hace la copia de cada tipo del día y poda las
// antiguas. Guardar y podar van en steps SEPARADOS por tipo: Inngest cachea cada
// step completado, así que un reintento (podar falló, red, timeout…) no repite el
// guardarBackup ya hecho —evita copias duplicadas— ni rehace los tipos anteriores.
export const procesarBackupsEstudio = inngest.createFunction(
  {
    id: 'backups-estudio',
    triggers: [{ event: EVENTS.BACKUPS_ESTUDIO }],
    concurrency: { limit: 5 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, tipos } = event.data as { studioId: string; tipos: TipoBackup[] };

    for (const tipo of tipos) {
      await step.run(`guardar-${tipo}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');
        await guardarBackup(admin, { studioId, tipo });
        return { studioId, tipo };
      });
      await step.run(`podar-${tipo}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');
        await podarBackupsAntiguos(admin, studioId, tipo);
        return { studioId, tipo };
      });
    }

    return { studioId, tipos };
  },
);
