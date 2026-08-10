// Recordatorios de clase — mismo patrón durable que backups/dunning/valoraciones
// (dispatcher cron → fan-out de un evento por estudio → worker por estudio).
//
// Antes esto era un route de Vercel Cron (/api/cron/recordatorios) que recorría
// las sesiones próximas de TODOS los estudios en una sola invocación acotada a
// maxDuration=300 (su propio comentario lo marcaba "P0-37: parche hasta la
// cola"). Con volumen, el barrido se pasa del límite y muere a medias, y un
// estudio lento (p.ej. muchas socias sin email, WhatsApp caído) retrasa el aviso
// de los demás. Con el fan-out cada estudio es un job aislado con reintentos
// propios y concurrencia acotada — hallazgo M-5 de la auditoría 2026-07-29.
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from './estudios.ts';
import { enviarRecordatoriosClasesProximas } from '@/lib/db/supabase-data-admin';

// Dispatcher: diario a las 08:00 UTC (misma hora que tenía el Vercel Cron, ver
// vercel.json antes de este cambio). La ventana de 24h se calcula UNA vez para
// todos los estudios, igual que hacía el route.
export const recordatoriosDispatcher = inngest.createFunction(
  { id: 'recordatorios-dispatcher', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const { desdeISO, hastaISO } = await step.run('ventana-24h', async () => {
      const desde = new Date();
      const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
      return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() };
    });

    const studios = await step.run('list-studios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // `suspendido_en`: un estudio suspendido no debe seguir mandando
      // recordatorios de clase a sus socias.
      return idsEstudios(admin);
    });

    await enviarFanOutEnLotes(step, 'fan-out-recordatorios', EVENTS.RECORDATORIOS_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, desdeISO, hastaISO }));
    return { estudios: studios.length, desdeISO, hastaISO };
  },
);

// Worker: un run por estudio. No exige Resend: enviarRecordatoriosClasesProximas
// ya hace no-op (skipped) por socia si no está configurado, y también manda por
// WhatsApp cuando la socia lo prefiere.
export const procesarRecordatoriosEstudio = inngest.createFunction(
  {
    id: 'recordatorios-estudio',
    triggers: [{ event: EVENTS.RECORDATORIOS_ESTUDIO }],
    concurrency: { limit: 5 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, desdeISO, hastaISO } = event.data as { studioId: string; desdeISO: string; hastaISO: string };

    return step.run('enviar', () => enviarRecordatoriosClasesProximas(studioId, desdeISO, hastaISO));
  },
);
