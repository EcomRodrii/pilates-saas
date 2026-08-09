// ─────────────────────────────────────────────────────────────────────────────
// Check-in QR opcional (migr 20260809020328): el estudio con
// `studios.requiere_checkin_qr = false` confía en que quien reserva viene, así
// que aquí es donde se cumple esa promesa — sin este cron, una reserva
// CONFIRMADA se quedaría así para siempre porque nadie va a escanear nada.
//
// Por qué al TERMINAR la clase y no al confirmar la reserva: marcarla
// ASISTIDA en el momento de reservar rompería la cancelación normal (que
// opera sobre CONFIRMADA) y daría créditos/racha/referido por una clase que
// aún no ha ocurrido — abriría una vía de reservar y no ir, sin ir nunca,
// para seguir sumando racha. Esperar a que la clase termine evita las dos
// cosas: quien cancela antes de la clase nunca llega a este cron, y los
// créditos se otorgan por algo que de verdad pasó.
//
// Por qué no toca las reservas que el mostrador ya marcó a mano: solo mira
// `estado = 'CONFIRMADA'`. Si alguien marcó "No asistió" desde Asistentes
// antes de que corra este cron (el personal puede seguir haciéndolo siempre,
// con o sin este flag), esa reserva ya no es CONFIRMADA y el cron la deja tal
// cual — así que la penalización por no-show de Fase 3, si el estudio la
// tiene activada, sigue pudiendo aplicarse sobre esa excepción puntual.
//
// Reutiliza `checkinPublico` tal cual (mismo camino que el escáner y el
// código de 6 caracteres): idempotente, otorga créditos/referido/gamificación
// una sola vez, y ya comprueba `estado === 'CONFIRMADA'` por su cuenta — dos
// ejecuciones solapadas de este cron no duplican nada.
//
// Cadencia cada 15 min, sin fan-out por estudio — mismo patrón que
// minimo-asistentes.ts: query global, doble filtro SQL+JS. Ventana de
// búsqueda de 2h hacia atrás (no solo "desde la última ejecución"): si un
// tick se retrasa o falla, el siguiente sigue encontrando las sesiones que se
// quedaron sin marcar, sin depender de guardar un cursor en ningún sitio.
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { checkinPublico } from '@/lib/db/supabase-data-admin';

const VENTANA_MS = 2 * 3600_000;

export const checkinAutomaticoDispatcher = inngest.createFunction(
  { id: 'checkin-automatico', triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => {
    return step.run('marcar-asistidas', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const ahora = new Date();
      const desde = new Date(ahora.getTime() - VENTANA_MS).toISOString();

      const { data: sesiones } = await admin
        .from('sesiones')
        .select('id, studio_id')
        .eq('cancelada', false)
        .gt('fin', desde)
        .lte('fin', ahora.toISOString());
      if (!sesiones?.length) return { sesiones: 0, marcadas: 0 };

      const studioIds = [...new Set(sesiones.map(s => s.studio_id as string))];
      const { data: studios } = await admin
        .from('studios').select('id, requiere_checkin_qr').in('id', studioIds);
      const sinCheckinQr = new Set(
        (studios ?? []).filter(s => s.requiere_checkin_qr === false).map(s => s.id as string),
      );
      if (!sinCheckinQr.size) return { sesiones: sesiones.length, marcadas: 0 };

      const sesionIdsElegibles = sesiones
        .filter(s => sinCheckinQr.has(s.studio_id as string))
        .map(s => s.id as string);
      if (!sesionIdsElegibles.length) return { sesiones: sesiones.length, marcadas: 0 };

      const { data: reservas } = await admin
        .from('reservas')
        .select('id, studio_id')
        .in('sesion_id', sesionIdsElegibles)
        .eq('estado', 'CONFIRMADA');

      let marcadas = 0;
      for (const r of reservas ?? []) {
        const res = await checkinPublico({ studioId: r.studio_id as string, reservaId: r.id as string });
        if ('ok' in res) marcadas++;
      }
      return { sesiones: sesiones.length, reservasElegibles: reservas?.length ?? 0, marcadas };
    });
  },
);
