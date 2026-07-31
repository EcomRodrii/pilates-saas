// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10) — mismo
// patrón durable que backups/recordatorios (dispatcher cron → fan-out de un
// evento por estudio → worker por estudio).
//
// Antes esto era un route de Vercel Cron (/api/cron/revisiones-salud) que
// recorría las condiciones activas de TODOS los estudios en una sola invocación
// acotada a maxDuration=300. Con el fan-out cada estudio es un job aislado —
// hallazgo M-5 de la auditoría 2026-07-29.
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { generarRecordatoriosRevision } from '@/lib/db/supabase-data-admin';

// Dispatcher: diario a las 07:00 UTC (misma hora que tenía el Vercel Cron, ver
// vercel.json antes de este cambio).
export const revisionesSaludDispatcher = inngest.createFunction(
  { id: 'revisiones-salud-dispatcher', triggers: [{ cron: '0 7 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // `suspendido_en`: un estudio suspendido no necesita revisiones de
      // ficha de salud nuevas.
      const { data, error } = await admin.from('studios').select('id').is('suspendido_en', null);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    await enviarFanOutEnLotes(step, 'fan-out-revisiones-salud', EVENTS.REVISIONES_SALUD_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, nowISO }));
    return { estudios: studios.length, nowISO };
  },
);

// Worker: un run por estudio. Solo notificación in-app — no necesita Resend.
// Idempotente por condición+mes gracias al dedupKey del Notification Engine
// (ver generarRecordatoriosRevision).
export const procesarRevisionesSaludEstudio = inngest.createFunction(
  {
    id: 'revisiones-salud-estudio',
    triggers: [{ event: EVENTS.REVISIONES_SALUD_ESTUDIO }],
    concurrency: { limit: 5 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };

    return step.run('generar', () => generarRecordatoriosRevision(studioId, nowISO));
  },
);
