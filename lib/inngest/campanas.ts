import { inngest, EVENTS } from './client';
import { Resend } from 'resend';
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
import { correoAutomatizacion } from '@/lib/emails/estudio/mensajes';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { appUrl, resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
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
  {
    id: 'campanas-enviar', triggers: [{ event: EVENTS.CAMPANA_ENVIAR }], retries: 3, concurrency: { limit: 5 },
    // ⚠️ Auditoría 2026-09-22 (AU-5 / E-12): sin esto, agotar los 3 reintentos
    // dejaba la campaña en ENVIANDO PARA SIEMPRE. El compare-and-set de
    // /api/marketing/campanas/[id]/enviar solo acepta BORRADOR|PROGRAMADA, no
    // hay barrido de ENVIANDO atascadas, y la UI de marketing no pinta ni un
    // botón para ese estado (`app/(dashboard)/marketing/page.tsx:954-1002`): la
    // única salida era borrar la campaña, que destruye el registro.
    //
    // Devolverla a BORRADOR la hace reenviable. Esto NO reenvía nada por sí
    // mismo: solo cambia un estado.
    //
    // ⚠️ Solo para campañas de EMAIL, y el matiz importa. En email, reenviar
    // dentro de la ventana de idempotencia de Resend no duplica: la clave
    // `campana-${campanaId}-${socio.id}` es estable entre ejecuciones (distinto
    // del caso de automatizaciones, donde lleva el índice). Fuera de esa
    // ventana —que caduca, como la de Stripe— sí duplicaría, así que quien
    // reenvíe días después está aceptando ese riesgo conscientemente.
    //
    // En WHATSAPP no hay ninguna clave de idempotencia
    // (`lib/marketing/providers/whatsapp-meta.ts`): una campaña que murió tras
    // mandar a 200 de 500, reenviada, le llega DOS VECES a esas 200. Ahí es
    // preferible el atasco visible al mensaje duplicado, hasta que exista la
    // tabla de destinatarias que permita reanudar en vez de reenviar (AU-5,
    // pieza 3). Se deja constancia en el log para que el atasco no sea mudo.
    //
    // La forma exacta de lo que llega aquí NO está verificada contra un run real
    // de Inngest en este entorno — mismo límite honesto que declara
    // `lib/inngest/fallo-terminal.ts`. Según su documentación, `event` es el
    // `inngest/function.failed` y el original cuelga de `event.data.event`; se
    // leen las DOS formas por si acaso, porque si esto no encuentra los ids la
    // campaña se queda atascada exactamente igual que antes y nadie lo notaría.
    onFailure: async ({ event }) => {
      const e = event as { data?: { event?: { data?: unknown }; campanaId?: string; studioId?: string } };
      const datos = (e?.data?.event?.data ?? e?.data) as { campanaId?: string; studioId?: string } | undefined;
      if (!datos?.campanaId || !datos?.studioId) {
        console.error('[campanas-enviar:onFailure] no se han podido leer los ids de la campaña', JSON.stringify(event));
        return;
      }
      const admin = requireSupabaseAdmin();
      const { data: fila } = await admin.from('campanas')
        .select('tipo, estado').eq('id', datos.campanaId).eq('studio_id', datos.studioId).maybeSingle();
      if (fila?.estado !== 'ENVIANDO') return;
      if (fila.tipo !== 'EMAIL') {
        console.error(
          '[campanas-enviar:onFailure] campaña NO-email atascada en ENVIANDO, se deja así a propósito',
          '(reenviarla duplicaría los WhatsApp ya entregados):', datos.campanaId,
        );
        return;
      }
      const { error } = await admin.from('campanas')
        .update({ estado: 'BORRADOR' })
        .eq('id', datos.campanaId).eq('studio_id', datos.studioId).eq('estado', 'ENVIANDO');
      if (error) {
        console.error('[campanas-enviar:onFailure] no se pudo desatascar la campaña', datos.campanaId, error.message);
      }
    },
  },
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
      const [{ data }, marcaEstudio] = await Promise.all([
        requireSupabaseAdmin().from('studios').select('nombre, color_primario, logo_url').eq('id', studioId).maybeSingle(),
        resolverMarcaEstudio(studioId),
      ]);
      const fila = data as { nombre: string | null; color_primario: string | null; logo_url: string | null } | null;
      // La marca del correo viaja en el MISMO paso, sin añadir ninguno: el
      // color ya no sale de `color_primario` (ver lib/emails/color-marca.ts).
      return fila ? { ...fila, marca: marcaCorreoDesde(marcaEstudio, fila.nombre || 'Tu estudio') } : null;
    });
    const studioNombre = studio?.nombre || 'Tentare';
    // Una campaña que empezó antes de este despliegue trae el paso memoizado
    // sin `marca`: solo para ese caso se cae a las columnas de siempre.
    const marcaCorreo = studio?.marca ?? marcaCorreoDesde(
      { nombre: studio?.nombre, colorPrimario: studio?.color_primario, logoUrl: studio?.logo_url },
      studioNombre,
    );

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
      // ⚠️ Auditoría 2026-09-22 (AU-2): esto iba sin paginar. PostgREST corta en
      // 1.000 filas EN SILENCIO (lo documenta lib/supabase-data.ts:207), y las
      // destinatarias SÍ vienen paginadas: a partir de la socia 1.001 el Map no
      // tenía su entrada, `tieneConsentimientoMarketingVigente(undefined, …)`
      // devolvía false y se la descartaba. Falla cerrado (no escribe a quien no
      // debe), pero la campaña se marcaba ENVIADA con un `enviados` menor y ni
      // un error en ninguna parte. Se pagina a mano y no con `fetchAllRows`
      // porque ese helper vive en el módulo del cliente de navegador.
      const admin = requireSupabaseAdmin();
      const filas: { id: string; consentimiento_marketing_texto: string | null }[] = [];
      const TAM = 1000;
      for (let desde = 0; ; desde += TAM) {
        const { data, error } = await admin.from('socios')
          .select('id, consentimiento_marketing_texto').eq('studio_id', studioId)
          .order('id').range(desde, desde + TAM - 1);
        // El error NO se traga: `data` null daría un lote vacío, saldría del
        // bucle y seguiría con los consentimientos truncados — el mismo fallo
        // silencioso que esta paginación viene a cerrar, solo que por otra
        // causa. Lanzar aquí deja que Inngest reintente el step.
        if (error) throw new Error(`consentimientos: ${error.message}`);
        const lote = (data ?? []) as { id: string; consentimiento_marketing_texto: string | null }[];
        filas.push(...lote);
        if (lote.length < TAM) break;
      }
      return filas;
    });
    const consentimientos = new Map<string, string>();
    for (const row of filasConsentimiento) {
      if (row.consentimiento_marketing_texto) consentimientos.set(row.id, row.consentimiento_marketing_texto);
    }
    const destinatarias = filtrarPorConsentimientoMarketing(porCanal, consentimientos, textoVigente);

    const apiKey = process.env.RESEND_API_KEY;
    const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
    // ⚠️ Auditoría 2026-09-22 (AU-7): sin este guard, una campaña EMAIL con
    // `RESEND_API_KEY` ausente, rotada o todavía con el placeholder `re_XXXX…`
    // recorría a todas sus destinatarias devolviendo `{ ok: false }` MUDO (sin
    // campo `error`, que nadie acumula), llegaba al paso `marcar-enviada` y la
    // dejaba **ENVIADA con 0 envíos**. El CAS de la ruta impide reenviarla
    // (409 «ya se envió»), así que la campaña se perdía y la pantalla decía que
    // había salido bien. Sin Sentry, sin log, sin salud de integración.
    //
    // Es el mismo guard que ya lleva su gemelo `procesarEstudioAutomatizaciones`
    // (`lib/inngest/automatizaciones.ts`). Lanzar aquí hace fallar la función →
    // 3 reintentos → `inngest/function.failed` → Sentry vía
    // `alertarFalloTerminalInngest` → y el `onFailure` de arriba devuelve la
    // campaña a BORRADOR, entera y reenviable. Un éxito falso pasa a ser un
    // fallo visible.
    if (campana.tipo === 'EMAIL' && !resend) {
      throw new Error('Resend no configurado (RESEND_API_KEY): campaña no enviada');
    }

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
          // `resend` ya no puede ser null aquí (guard de arriba), pero el tipo
          // sigue admitiéndolo. Lo que sí pasa de verdad es la ficha sin email:
          // antes salía como `{ ok: false }` mudo y no quedaba escrito en
          // ninguna parte por qué esa socia no recibió la campaña.
          if (!resend) return { ok: false, error: 'Resend no configurado' };
          if (!socio.email) return { ok: false, error: `${socio.nombre} no tiene email en su ficha` };
          const html = correoAutomatizacion({
            socioNombre: socio.nombre,
            titulo: campana.asunto,
            mensaje: campana.contenido,
            marca: marcaCorreo,
            // LSSI: toda comunicación comercial lleva enlace de baja.
            unsubscribeUrl: `${appUrl()}/api/marketing/baja?token=${firmarBajaMarketing(studioId, socio.id)}`,
          });
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
