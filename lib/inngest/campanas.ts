import { inngest, EVENTS } from './client';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllStudioData, mapCampana } from '@/lib/supabase-data';
import { resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import { resendEmailProvider } from '@/lib/marketing/providers/email-resend';
import { twilioSmsProvider } from '@/lib/marketing/providers/sms-twilio';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import type { RowCampanas } from '@/lib/db-types';

// Envío server-side de una campaña — reemplaza el mapLimit(8) que orquestaba
// el envío destinataria a destinataria desde el navegador (P0-24). Un evento
// por campaña, disparado por app/api/marketing/campanas/[id]/enviar/route.ts
// al pulsar "Enviar" — NO es fan-out de dispatcher cron, así que no compite
// con la cuota de Inngest de la misma forma que un polling. Ver
// docs/marketing-integrations-arquitectura.md §5.
//
// Mismo patrón que procesarEstudioAutomatizaciones (lib/inngest/automatizaciones.ts):
// un step.run por destinataria, para que un reintento tras una caída a mitad
// no reenvíe lo que ya salió (memoización de Inngest). El EmailProvider ya
// añade además el idempotencyKey de Resend (defensa en profundidad, mismo
// principio que ya aplica el repo a webhooks de Stripe).
export const procesarEnvioCampana = inngest.createFunction(
  { id: 'campanas-enviar', triggers: [{ event: EVENTS.CAMPANA_ENVIAR }], retries: 3, concurrency: { limit: 5 } },
  async ({ event, step }) => {
    const { campanaId, studioId } = event.data as { campanaId: string; studioId: string };

    const campana = await step.run('fetch-campana', async () => {
      const { data, error } = await requireSupabaseAdmin()
        .from('campanas').select('*').eq('id', campanaId).eq('studio_id', studioId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapCampana(data as RowCampanas) : null;
    });
    if (!campana) return { skipped: 'campana no encontrada' };

    const studio = await step.run('fetch-studio', async () => {
      const { data } = await requireSupabaseAdmin()
        .from('studios').select('nombre, color_primario, logo_url').eq('id', studioId).maybeSingle();
      return data as { nombre: string | null; color_primario: string | null; logo_url: string | null } | null;
    });
    const studioNombre = studio?.nombre || 'Tentare';

    // El recorte va DENTRO del step (mismo criterio que procesarEstudioAutomatizaciones):
    // solo se devuelve lo que hace falta, aunque fetchAllStudioData consulte
    // el arranque completo del panel por dentro.
    const { socios, suscripciones } = await step.run('fetch-destinatarias', async () => {
      const d = await fetchAllStudioData(studioId);
      return { socios: d.socios, suscripciones: d.suscripciones };
    });

    const base = resolverDestinatariasCampana(campana.destinatarios, { socios, suscripciones });
    const destinatarias = campana.tipo === 'EMAIL'
      ? base.filter(s => s.email && s.email.includes('@'))
      : base.filter(s => s.telefono && s.telefono.trim());

    const apiKey = process.env.RESEND_API_KEY;
    const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;

    let enviados = 0;
    for (let i = 0; i < destinatarias.length; i++) {
      const socio = destinatarias[i];
      const ok = await step.run(`envio-${i}-${socio.id}`, async () => {
        if (campana.tipo === 'EMAIL') {
          if (!resend || !socio.email) return false;
          const html = await render(AutomatizacionEmail({
            socioNombre: socio.nombre,
            titulo: campana.asunto,
            mensaje: campana.contenido,
            estudioNombre: studioNombre,
            colorPrimario: studio?.color_primario ?? null,
            logoUrl: studio?.logo_url ?? null,
          }));
          const r = await resendEmailProvider(resend).enviar({
            to: socio.email,
            subject: campana.asunto,
            html,
            studioNombre,
            // Idempotencia campana+socia: si el step se reintenta tras enviar
            // pero antes de memoizar, Resend reconoce la clave y no reenvía.
            idempotencyKey: `campana-${campanaId}-${socio.id}`,
          });
          return r.ok;
        }
        const cuerpo = campana.asunto ? `${campana.asunto}\n\n${campana.contenido}` : campana.contenido;
        const r = await twilioSmsProvider.enviar({ canal: campana.tipo, to: socio.telefono, cuerpo });
        return r.ok;
      });
      if (ok) enviados++;
    }

    await step.run('marcar-enviada', async () => {
      const { error } = await requireSupabaseAdmin()
        .from('campanas')
        .update({ estado: 'ENVIADA', enviados, enviada_en: new Date().toISOString() })
        .eq('id', campanaId).eq('studio_id', studioId);
      if (error) throw new Error(error.message);
    });

    return { campanaId, enviados, total: destinatarias.length };
  }
);
