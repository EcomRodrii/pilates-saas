import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarAutomatizaciones } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllStudioDataServidor, dbUpdateAutomationRuleServidor, dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { computeAutomationCandidatos } from '@/lib/engines/automation-engine';
import { procesarCandidato } from '@/lib/inngest/automatizaciones';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { mapLimit } from '@/lib/concurrency';
import type { AutomationLog } from '@/lib/types';
import { errorInterno } from '@/lib/errores-servidor';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';

// Un estudio grande puede tener bastantes candidatos (email + redacción IA por
// cada uno); damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

// R5 · "Ejecutar ahora" de /automatizaciones, AHORA en el servidor.
//
// Antes corría en el navegador (StudioContext.runAutomation): computaba los
// candidatos sobre los arrays EN MEMORIA del contexto —que pueden estar
// incompletos/capados (ver R3)— y enviaba los emails desde la pestaña. Eso
// significaba que el botón manual podía DIVERGIR del cron diario de Inngest
// (que usa fetchAllStudioData, datos completos): detectar de menos o de más.
//
// Ahora reutiliza EXACTAMENTE el núcleo del cron: fetchAllStudioData +
// computeAutomationCandidatos + procesarCandidato. Como procesarCandidato usa un
// id de log DETERMINISTA (estudio+regla+socia+día), si el cron ya corrió hoy el
// dbUpsert deduplica y Resend no reenvía (misma idempotency-key) → ejecutar a
// mano tras el cron es seguro. Solo el subconjunto de reglas (no las
// automatizaciones de marketing), igual que hacía el botón antes.
// Acepta `{ dry: true }` para una pasada en seco: calcula los mismos candidatos
// y devuelve los mismos logs, pero procesarCandidato no envía nada (ni email ni
// WhatsApp) y no persiste ningún log — el `if (!dry)` del final. Sirve para dos
// cosas: poder verificar un cambio del motor contra datos reales sin escribirle
// a nadie, y para que la UI pueda responder a "¿qué va a hacer si le doy?" antes
// de que la propietaria pulse un botón que manda mensajes en su nombre.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Esta ruta corre con service-role, que SE SALTA la RLS: el rol hay que
  // mirarlo AQUÍ o no lo mira nadie. Y lo que ejecuta no es poca cosa —
  // manda emails y WhatsApps REALES a las clientas en nombre del estudio.
  // Sin esto, cualquiera con sesión de staff podía dispararlo desde la consola
  // del navegador, aunque el Centro de Control esté oculto en su menú.
  // Mismo criterio que la pantalla /automatizaciones (solo la propietaria):
  // antes era `puedeMoverDinero`, que dejaba pasar a recepción.
  if (!puedeGestionarAutomatizaciones(sesion.rol)) {
    return NextResponse.json(
      { error: 'No tienes permiso para ejecutar automatizaciones.' },
      { status: 403 },
    );
  }

  const dry = await req
    .json()
    .then((b: unknown) => (b as { dry?: boolean } | null)?.dry === true)
    .catch(() => false); // sin body / body inválido → ejecución real, como antes

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
  if (!resend) {
    return NextResponse.json({ error: 'Resend no configurado. Añade RESEND_API_KEY.' }, { status: 503 });
  }

  const nowISO = new Date().toISOString();

  try {
    const [data, marcaEstudio] = await Promise.all([
      fetchAllStudioDataServidor(sesion.studioId),
      // Mismo camino que el cron: la marca del correo, una vez por estudio, del
      // tema y no de `studios.color_primario` (índigo de alta, ver
      // lib/emails/color-marca.ts).
      resolverMarcaEstudio(sesion.studioId),
    ]);
    // ⚠️ Auditoría 2026-09-23 (AUT-9): el cron filtra los estudios suspendidos
    // con `.is('suspendido_en', null)` y el motivo está escrito allí — «un
    // estudio suspendido por impago/abuso no debe seguir recibiendo mensajes
    // automáticos con IA a nombre del negocio». Este botón no comprobaba nada:
    // un estudio suspendido podía seguir emitiendo correos y WhatsApps a sus
    // clientas pulsándolo.
    // `suspendido_en` no viaja en el `Studio` del panel, así que se lee aquí.
    {
      const { data: susp } = await admin.from('studios')
        .select('suspendido_en').eq('id', sesion.studioId).maybeSingle();
      if (susp?.suspendido_en) {
        return NextResponse.json(
          { error: 'Este estudio está suspendido: las automatizaciones no se ejecutan.' },
          { status: 403 },
        );
      }
    }
    const studioNombre = data.studio?.nombre ?? 'tu estudio';
    const marca = marcaCorreoDesde(marcaEstudio, studioNombre);

    // I-5: mismo guard de consentimiento que el cron (lib/inngest/automatizaciones.ts)
    // — data.socios no trae el texto completo (mismo ahorro de payload que el
    // resto del panel), así que se lee aparte, targeted.
    //
    // ⚠️ Auditoría 2026-09-23 (AUT-3): AU-2 paginó este SELECT en el cron
    // (lib/inngest/automatizaciones.ts) y en campanas.ts, pero se dejó sin
    // tocar este tercer llamador — el botón «Ejecutar ahora» de la propietaria.
    // Sin paginar, PostgREST corta a 1.000 filas EN SILENCIO; y sin comprobar
    // `error`, un fallo de BD devuelve `undefined` → `?? []` → Map vacío → cero
    // consentimientos. En los dos casos el botón DIVERGE del cron: descarta
    // candidatos comerciales que el cron sí envía, sin error y sin rastro.
    // Mismo bucle, literalmente, que el del cron.
    const filasConsentimiento: { id: string; consentimiento_marketing_texto: string | null }[] = [];
    {
      const TAM = 1000;
      for (let desde = 0; ; desde += TAM) {
        const { data: rows, error } = await admin.from('socios')
          .select('id, consentimiento_marketing_texto').eq('studio_id', sesion.studioId)
          .order('id').range(desde, desde + TAM - 1);
        if (error) throw new Error(`consentimientos: ${error.message}`);
        const lote = (rows ?? []) as { id: string; consentimiento_marketing_texto: string | null }[];
        filasConsentimiento.push(...lote);
        if (lote.length < TAM) break;
      }
    }
    const consentimientosMarketing = new Map<string, string>();
    for (const row of filasConsentimiento) {
      if (row.consentimiento_marketing_texto) consentimientosMarketing.set(row.id, row.consentimiento_marketing_texto);
    }
    const textoConsentimientoVigente = textoConsentimientoMarketing({ nombre: studioNombre });

    const candidatos = computeAutomationCandidatos(
      {
        automationRules: data.automationRules,
        automationLogs: data.automationLogs,
        // AU-3: índice "de por vida" — ver comentario en fetchCriticalStudioDataCon.
        automationLogsHistorico: data.automationLogsHistorico,
        socios: data.socios,
        reservas: data.reservas,
        recibos: data.recibos,
        sesiones: data.sesiones,
        tiposClase: data.tiposClase,
        suscripciones: data.suscripciones,
        planesTarifa: data.planesTarifa,
        consentimientosMarketing,
        textoConsentimientoVigente,
      },
      new Date(nowISO),
    );

    // Las credenciales de WhatsApp del estudio, para que este botón mande por
    // el mismo sitio que el cron: son de cada estudio (Meta Cloud API), ya no un
    // secreto único de plataforma. Se leen una vez y se pasan a los N
    // candidatos, no una vez por candidato.
    const whatsapp = whatsappDelEstudio(await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP'));

    // Concurrencia acotada (como el botón anterior): procesarCandidato es
    // independiente por candidato, escribe su log (dbUpsert, id determinista) y
    // Resend deduplica por idempotency-key, así que paralelizar es seguro.
    const logs: AutomationLog[] = await mapLimit(
      candidatos,
      6,
      (c) => procesarCandidato(c, { studioId: sesion.studioId, studioNombre, marca, nowISO, dry, resend, whatsapp }),
    );

    // En seco no se toca el contador: no ha disparado nada.
    if (!dry) {
      // Contador de disparos por regla (determinista, como el cron).
      const firedPorRegla = new Map<string, number>();
      for (const c of candidatos) firedPorRegla.set(c.rule.id, (firedPorRegla.get(c.rule.id) ?? 0) + 1);
      for (const [ruleId, count] of firedPorRegla) {
        const base = data.automationRules.find((r) => r.id === ruleId)?.ejecutadaVeces ?? 0;
        await dbUpdateAutomationRuleServidor(ruleId, sesion.studioId, { ejecutadaVeces: base + count, ultimaEjecucion: nowISO });
      }
    }

    return NextResponse.json({ dry, logs });
  } catch (err) {
    return errorInterno('automatizaciones/run:POST', err, 'No se han podido ejecutar las automatizaciones. Inténtalo de nuevo.');
  }
}
