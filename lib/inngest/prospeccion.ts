import { inngest, EVENTS } from './client';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarProspeccion } from '@/lib/marketing/prospeccion-smtp';

// Envío de un lote de outreach en frío. Lo dispara una persona pulsando
// "Enviar siguiente lote" en /interno/crecimiento — NO es fan-out de un
// dispatcher cron, así que no compite con la cuota de Inngest de la misma forma
// que un polling (mismo criterio que `procesarEnvioCampana`).
//
// Un `step.run` por correo, igual que campañas: si la función se cae a mitad de
// lote y se reintenta, Inngest memoiza los pasos ya completados y no reenvía lo
// que ya salió. Un fallo individual NO tumba el resto — se marca esa fila
// FALLIDA con el error SMTP y el bucle sigue, porque lo contrario significaría
// que un buzón inexistente bloquea a los nueve estudios siguientes.
export const enviarLoteProspeccion = inngest.createFunction(
  { id: 'prospeccion-enviar-lote', triggers: [{ event: EVENTS.PROSPECCION_ENVIAR_LOTE }], retries: 2 },
  async ({ event, step }) => {
    const { ids } = event.data as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) return { skipped: 'lote vacío' };

    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const resultado = await step.run(`envio-${i}-${id}`, async () => {
        const db = requireSupabaseAdmin();

        // Se relee el borrador DENTRO del step y se exige que siga APROBADO.
        // Entre que se pulsó el botón y le toca el turno a este correo pueden
        // haber pasado minutos: si alguien lo descartó mientras tanto, no sale.
        const { data: borrador } = await db
          .from('plataforma_prospeccion_email')
          .select('id, lead_id, asunto, cuerpo, estado')
          .eq('id', id)
          .maybeSingle();
        if (!borrador || borrador.estado !== 'APROBADO') return 'omitido';

        const { data: lead } = await db
          .from('plataforma_lead').select('email').eq('id', borrador.lead_id).maybeSingle();
        if (!lead?.email) {
          await db.from('plataforma_prospeccion_email')
            .update({ estado: 'FALLIDO', error: 'El lead ya no tiene email' }).eq('id', id);
          return 'fallido';
        }

        const r = await enviarProspeccion({
          to: lead.email as string,
          asunto: borrador.asunto as string,
          cuerpo: borrador.cuerpo as string,
        });

        if (!r.ok) {
          await db.from('plataforma_prospeccion_email')
            .update({ estado: 'FALLIDO', error: r.error ?? 'Error desconocido' }).eq('id', id);
          return 'fallido';
        }

        // El correo YA salió. A partir de aquí nada puede lanzar: si esta
        // escritura fallara y el step se reintentara, se reenviaría un correo
        // que el destinatario ya tiene. El índice único parcial
        // `uq_prospeccion_lead_enviado` es la última red por si acaso.
        await db.from('plataforma_prospeccion_email')
          .update({ estado: 'ENVIADO', enviado_en: new Date().toISOString(), error: null })
          .eq('id', id);

        // El lead pasa a CONTACTADO para que entre en el mismo radar de
        // seguimiento que el resto (`loQueQuemaHoy`): si no contesta en dos
        // días, aparece solo en la bandeja. Sin esto, los 100 prospectos se
        // quedarían en NUEVO para siempre y nadie volvería a mirarlos.
        // Condicionado a que siga en NUEVO: si ya iba por DEMO porque contestó
        // rapidísimo, no se le hace retroceder.
        await db.from('plataforma_lead')
          .update({ estado: 'CONTACTADO', actualizado_en: new Date().toISOString() })
          .eq('id', borrador.lead_id).eq('estado', 'NUEVO');

        return 'enviado';
      });

      if (resultado === 'enviado') enviados++;
      else if (resultado === 'fallido') fallidos++;
    }

    return { enviados, fallidos, total: ids.length };
  },
);
