import { inngest, EVENTS } from './client';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { mapCampana } from '@/lib/supabase-data';
import { fetchAllStudioDataServidor } from '@/lib/db/supabase-data-admin';
import { resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import { filtrarPorConsentimientoMarketing } from '@/lib/marketing/consentimiento';
import { firmarBajaMarketing } from '@/lib/marketing/unsubscribe-token';
import { resendEmailProvider } from '@/lib/marketing/providers/email-resend';
import { whatsappMetaProvider } from '@/lib/marketing/providers/whatsapp-meta';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { acumuladorSalud } from '@/lib/integraciones/salud';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { appUrl } from '@/lib/emails/plantillas-server';
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
    // Determinismo entre reintentos (mismo patrón que automatizacionesDispatcher):
    // usada por resolverDestinatariasCampana (BONO_CADUCA_PRONTO/CUMPLE_ESTE_MES),
    // si se calculara fuera de un step.run un replay tras un fallo a mitad
    // podría recalcular un segmento distinto a mitad de envío.
    const nowISO = await step.run('now', async () => new Date().toISOString());
    const now = new Date(nowISO);

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
    const { socios, suscripciones, recibos } = await step.run('fetch-destinatarias', async () => {
      const d = await fetchAllStudioDataServidor(studioId);
      return { socios: d.socios, suscripciones: d.suscripciones, recibos: d.recibos };
    });

    const base = resolverDestinatariasCampana(campana.destinatarios, { socios, suscripciones, recibos }, now);
    const porCanal = campana.tipo === 'EMAIL'
      ? base.filter(s => s.email && s.email.includes('@'))
      : base.filter(s => s.telefono && s.telefono.trim());

    // Guard de consentimiento (art. 7.4 RGPD, docs/marketing-integrations-arquitectura.md
    // §7): select TARGETED con el texto completo (fetchAllStudioData/mapSocio
    // lo excluye a propósito del arranque del panel, ver FilaSocioPanel) — mismo
    // criterio que ya usa lib/inngest/penalizaciones.ts para AceptacionContrato.
    const textoVigente = textoConsentimientoMarketing({ nombre: studioNombre });
    // Filas crudas, NO un Map: lo que devuelve un step.run se serializa como
    // estado de Inngest, y un Map se reconstruye como {} en el replay (mismo
    // gotcha ya documentado para dbGetFeatureFlags en lib/inngest/decision.ts).
    // El Map se construye SIEMPRE fuera del step.
    const filasConsentimiento = await step.run('fetch-consentimientos', async () => {
      const { data } = await requireSupabaseAdmin()
        .from('socios').select('id, consentimiento_marketing_texto').eq('studio_id', studioId);
      return (data ?? []) as { id: string; consentimiento_marketing_texto: string | null }[];
    });
    const consentimientos = new Map<string, string>();
    for (const row of filasConsentimiento) {
      if (row.consentimiento_marketing_texto) consentimientos.set(row.id, row.consentimiento_marketing_texto);
    }
    const destinatarias = filtrarPorConsentimientoMarketing(porCanal, consentimientos, textoVigente);

    const apiKey = process.env.RESEND_API_KEY;
    const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;

    // Credenciales de WhatsApp del estudio, FUERA de cualquier `step.run` a
    // propósito: lo que devuelve un step lo persiste Inngest como estado de la
    // ejecución, y ahí no pinta nada el token de Meta de un cliente. Releerlas
    // en cada replay cuesta una consulta y evita eso.
    //
    // `null` no es un caso raro que haya que tratar aquí: /api/marketing/campanas/[id]/enviar
    // ya rechaza una campaña de WhatsApp sin integración antes de encolarla, así
    // que llegar sin credenciales solo pasa si la desconectaron entre medias.
    const whatsapp = campana.tipo === 'WHATSAPP'
      ? whatsappDelEstudio(await dbGetIntegracionConfig(studioId, 'WHATSAPP'))
      : null;
    // Cómo le fue a Meta en ESTA tanda: una escritura al final, no una por
    // destinataria (mismo acumulador y mismo criterio que el cron de
    // recordatorios — un acierto gana a los fallos de números mal escritos).
    const salud = acumuladorSalud();

    let enviados = 0;
    for (let i = 0; i < destinatarias.length; i++) {
      const socio = destinatarias[i];
      // El step devuelve el resultado entero y no un booleano para que la salud
      // de la integración se pueda acumular AQUÍ FUERA: un acumulador mutado
      // dentro del step se perdería en un replay (Inngest memoiza el resultado,
      // no vuelve a ejecutar el cuerpo).
      const r = await step.run(`envio-${i}-${socio.id}`, async (): Promise<{ ok: boolean; error?: string; meta?: boolean }> => {
        if (campana.tipo === 'EMAIL') {
          if (!resend || !socio.email) return { ok: false };
          const html = await render(AutomatizacionEmail({
            socioNombre: socio.nombre,
            titulo: campana.asunto,
            mensaje: campana.contenido,
            estudioNombre: studioNombre,
            colorPrimario: studio?.color_primario ?? null,
            logoUrl: studio?.logo_url ?? null,
            // LSSI: toda comunicación comercial lleva enlace de baja.
            unsubscribeUrl: `${appUrl()}/api/marketing/baja?token=${firmarBajaMarketing(studioId, socio.id)}`,
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
          return { ok: r.ok, error: r.error };
        }
        if (!whatsapp) return { ok: false, error: 'WhatsApp Business no está conectado en este estudio' };
        // Texto, no plantilla, y no por falta de ganas: el cuerpo lo escribe la
        // propietaria y es distinto en cada campaña, así que no hay plantilla
        // que Meta pueda tener aprobada de antemano — y un parámetro de
        // plantilla ni siquiera admite el salto de línea que separa asunto de
        // contenido. Llega a quien escribió al estudio en las últimas 24 h; al
        // resto Meta responde 131047, que queda en la salud de la integración.
        const cuerpo = campana.asunto ? `${campana.asunto}\n\n${campana.contenido}` : campana.contenido;
        const env = await whatsappMetaProvider(whatsapp).enviar({ to: socio.telefono, cuerpo });
        return { ok: env.ok, error: env.error, meta: true };
      });
      if (r.ok) enviados++;
      // Solo cuenta como noticia de Meta lo que de verdad habló con Meta: un
      // email fallido no dice nada sobre el token de WhatsApp.
      if (r.meta) salud.anota(r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Error al enviar por WhatsApp' });
    }

    // `null` si no se intentó ningún envío por Meta: sin noticia nueva del
    // servicio, sobrescribir la salud borraría la que sí valía.
    const resultadoSalud = salud.resultado();
    if (resultadoSalud) {
      await step.run('salud-whatsapp', () =>
        registrarSaludIntegracion(requireSupabaseAdmin(), studioId, 'WHATSAPP', resultadoSalud));
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
