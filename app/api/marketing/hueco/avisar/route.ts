import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla, PLANTILLA_HUECO } from '@/lib/whatsapp';
import { resendEmailProvider } from '@/lib/marketing/providers/email-resend';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { firmarBajaMarketing } from '@/lib/marketing/unsubscribe-token';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { normalizarEmail } from '@/lib/emails/rebotes';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { acumuladorSalud } from '@/lib/integraciones/salud';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { clasesConHuecoProximas, candidatasParaHueco } from '@/lib/booking-logic';
import { mapSesion, mapReserva, mapSocio, mapSuscripcion, mapPlanTarifa, hidratarTiposDePlanes } from '@/lib/supabase-data';
import type { RowSesiones, RowReservas, RowSocios, RowSuscripciones, RowPlanesTarifa } from '@/lib/db-types';
import { LEGAL } from '@/lib/legal-info';
import { filtrarPorConsentimientoMarketing } from '@/lib/marketing/consentimiento';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { fechaLargaEstudio, horaEstudio, hoyEnEstudio } from '@/lib/utils';

// Radar de ocupación → "Avisar a candidatas" (Configuración → Dashboard) y
// «Rellenar hueco» de la home.
//
// Dos canales, resueltos por socia: WhatsApp por la Meta Cloud API del PROPIO
// estudio (lib/whatsapp.ts + `integraciones` tipo WHATSAPP, lo que la
// propietaria conecta en Configuración → Integraciones) y, cuando ahí no se
// puede, email por Resend. Nunca por Twilio: en producción no existe ninguna
// variable TWILIO_*, así que esta ruta contestaba 503 sin intentar nada y
// `avisos_hueco` se quedó vacía desde el primer día.
//
// El email no es el plan B pobre: llega a MÁS gente (en producción, 19 de 19
// socias activas tienen correo y 15 tienen teléfono) y es el único canal que
// el consentimiento guardado nombra — «Acepto recibir por email…», con baja
// «desde el enlace de cualquier email» (textoConsentimientoMarketing). Se
// prefiere WhatsApp cuando el estudio lo ha conectado porque conectarlo ya es
// decir que quiere usarlo.
//
// ⚠️ NO se salta de un canal al otro cuando el envío falla, a propósito: un
// estudio con WhatsApp conectado pero sin la plantilla `hueco_disponible`
// aprobada tiene un problema de configuración, y taparlo mandando correos por
// detrás lo dejaría sin arreglar para siempre. Los fallos se cuentan y quedan
// en `avisos_hueco`. ⚠️ Ese registro NO lo lee ninguna pantalla todavía —
// decía «y se ven en el panel», y era falso: no hay un solo consumidor de esa
// tabla en el repo. Lo que la propietaria ve es el recuento que devuelve esta
// ruta, ahí mismo, en el cajón de «Rellenar hueco».
//
// ⚠️ `resultado: 'ok'` significa «Resend/Meta ACEPTÓ el envío», no «llegó». Un
// correo aceptado con 200 puede rebotar dos segundos después, o estar en la
// lista de supresión de la cuenta y no salir nunca (las dos cosas, medidas el
// 11-sep-2026). Eso solo se sabe por webhook: app/api/webhooks/resend lo anota
// en `email_rebotes` y esta ruta lo consulta antes de volver a escribir.
//
// Server-only: manda WhatsApp real y necesita límite de gasto/spam — no hay
// ningún rate-limit de mensajería en el repo hasta esta ruta, así que se
// incorpora aquí desde el principio.
const VENTANA_DEDUP_HORAS = 24;
const CAP_MAXIMO = 30;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'hueco-avisar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede avisar a candidatas' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  // WhatsApp es de CADA estudio, no de la plataforma: sin su token/phoneId no
  // hay a quién pedirle el envío. Se resuelve antes de tocar la base de datos
  // porque recalcular candidatas para luego no tener por dónde mandarlas es
  // trabajo tirado (el corte, si no queda ningún canal, va unas líneas abajo).
  //
  // `whatsappDelEstudio` es el único sitio del repo que interpreta esas claves
  // de `config`, y ahí el opt-in de cada plantilla es PROPIO, nunca el del
  // recordatorio: son plantillas distintas en Meta, y dar por aprobada la que no
  // lo está falla en TODOS los envíos (132001), no en algunos.
  const whatsapp = whatsappDelEstudio(await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP'));

  // `re_XXXX` significa «sin configurar», igual que `sk_test_XXXX` en Stripe —
  // no es una clave de pruebas válida.
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey && !resendKey.startsWith('re_XXXX') ? new Resend(resendKey) : null;

  // Solo se corta si no queda NINGÚN canal. Antes bastaba con no tener WhatsApp
  // para devolver 503, y eso dejaba fuera el correo — el canal que llega a más
  // socias y el único que el consentimiento guardado cubre.
  if (!whatsapp && !resend) {
    return NextResponse.json(
      { error: 'No hay ningún canal disponible: conecta tu WhatsApp Business en Configuración → Integraciones' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { sesionId?: string; socioIds?: unknown } | null;
  const sesionId = body?.sesionId;
  if (!sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });
  // «Rellenar hueco» (home) manda a QUIÉN avisar; el radar de siempre no manda
  // nada y sigue avisando a todas. La lista es un FILTRO, nunca la fuente: las
  // candidatas se recalculan igual en servidor y esto solo puede quitar gente
  // de esa lista, jamás añadirla — mandar un id que no cumple las reglas no
  // hace que se le mande el WhatsApp.
  const seleccion = Array.isArray(body?.socioIds)
    ? new Set(body.socioIds.filter((x): x is string => typeof x === 'string'))
    : null;
  if (seleccion && seleccion.size === 0) {
    return NextResponse.json({ error: 'No has seleccionado a nadie' }, { status: 400 });
  }

  try {
    // Nunca confiar en lo que mande el cliente sobre ocupación/candidatas —
    // se recalcula todo server-side contra datos frescos del propio estudio.
    const { data: sesionRow } = await admin.from('sesiones').select('*').eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sesionRow) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
    const sesionObj = mapSesion(sesionRow as RowSesiones);

    const [{ data: sesionesRows }, { data: reservasRows }, { data: sociosRows }, { data: suscripcionesRows }, { data: planesRows }, { data: studioRow }, { data: tipoRow }] = await Promise.all([
      admin.from('sesiones').select('*').eq('studio_id', sesion.studioId),
      admin.from('reservas').select('*').eq('studio_id', sesion.studioId),
      admin.from('socios').select('*').eq('studio_id', sesion.studioId),
      admin.from('suscripciones').select('*').eq('studio_id', sesion.studioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', sesion.studioId),
      admin.from('studios').select('nombre, slug, logo_url, color_primario').eq('id', sesion.studioId).single(),
      admin.from('tipos_clase').select('nombre').eq('id', sesionObj.tipoClaseId).maybeSingle(),
    ]);

    const sesiones = (sesionesRows ?? []).map(r => mapSesion(r as RowSesiones));
    const reservas = (reservasRows ?? []).map(r => mapReserva(r as RowReservas));
    const socios = (sociosRows ?? []).map(r => mapSocio(r as RowSocios));
    const suscripciones = (suscripcionesRows ?? []).map(r => mapSuscripcion(r as RowSuscripciones));
    // ⚠️ HIDRATAR es obligatorio, no un extra. `mapPlanTarifa` no trae
    // `tiposClaseIds` —no es columna de `planes_tarifa`, vive en la tabla
    // puente `plan_tipos_clase`— y `planCubreTipoClase` lee la lista vacía
    // como «cubre TODAS las clases».
    //
    // Sin esto, el filtro por cobertura de `candidatasParaHueco` no filtraba
    // nada: a una socia con «Bono 10 Mat» se le mandaba un WhatsApp
    // ofreciéndole un hueco de Reformer, y al ir a reservarlo
    // `crearReservaPublica` la rechazaba con «Tu bono no incluye este tipo de
    // clase». Un mensaje comercial que promete algo que el servidor niega.
    //
    // Los otros cuatro llamadores de `mapPlanTarifa` en servidor ya hidratan
    // (supabase-data-admin.ts: 611, 973, 1061, 1961); esta ruta era la única
    // que se lo había saltado.
    const planesTarifa = await hidratarTiposDePlanes(
      admin as never, sesion.studioId, (planesRows ?? []).map(r => mapPlanTarifa(r as RowPlanesTarifa)),
    );

    // Confirma que sigue siendo una sesión futura por debajo del umbral —
    // protege contra un doble clic sobre datos ya obsoletos.
    //
    // El aforo usado aquí tiene que ser el EFECTIVO (descontando máquinas
    // averiadas en bloqueos_maquina, igual que aforo_efectivo() en la BD y
    // reservar_plaza), no el aforoMaximo en bruto: si no, el radar podía avisar
    // por WhatsApp de un hueco que en realidad no existe porque la sala tiene
    // reformers de baja, y la socia llegaba a una clase ya llena.
    const { data: aforoEfectivo } = await admin.rpc('aforo_efectivo', { p_sesion_id: sesionId });
    const sesionParaRadar = typeof aforoEfectivo === 'number' ? { ...sesionObj, aforoMaximo: aforoEfectivo } : sesionObj;

    const ahora = new Date();
    const huecos = clasesConHuecoProximas({ sesiones: [sesionParaRadar], reservas, ahora });
    if (huecos.length === 0) {
      return NextResponse.json({ error: 'Esta clase ya no tiene hueco (o ya no está en la ventana de aviso)' }, { status: 409 });
    }
    const { huecos: plazasLibres } = huecos[0];

    // El día del ESTUDIO, no el de UTC: entre las 00:00 y las 02:00 de Madrid
    // el día UTC es todavía el anterior, así que un bono caducado ayer contaba
    // como vigente y su dueña entraba en la lista de candidatas.
    const hoyISO = hoyEnEstudio(ahora);
    let candidatas = candidatasParaHueco({ sesion: sesionObj, sesiones, socios, reservas, suscripciones, planesTarifa, hoyISO });
    if (seleccion) candidatas = candidatas.filter(s => seleccion.has(s.id));

    // Cap: no tiene sentido avisar a mucha más gente que huecos reales.
    const cap = Math.min(candidatas.length, plazasLibres * 4, CAP_MAXIMO);
    candidatas = candidatas.slice(0, cap);

    // Dedup: no volver a avisar a la misma socia de la misma sesión en 24h.
    const desdeDedup = new Date(ahora.getTime() - VENTANA_DEDUP_HORAS * 3600_000).toISOString();
    const { data: yaAvisadas } = await admin
      .from('avisos_hueco').select('socio_id')
      .eq('sesion_id', sesionId).gte('enviado_en', desdeDedup);
    const avisadasSet = new Set((yaAvisadas ?? []).map(r => r.socio_id as string));
    // Se cuentan las que SALEN de esta tanda, no todas las avisadas de la
    // sesión: con lo segundo, seleccionar a una persona nueva podía contestar
    // «3 ya avisadas» hablando de otras tres que no estaban seleccionadas.
    const antesDeDedup = candidatas.length;
    candidatas = candidatas.filter(s => !avisadasSet.has(s.id));
    const saltadasPorDedup = antesDeDedup - candidatas.length;

    // F2 (B2.9): "a esta jamás le avises de huecos" — la dueña lo manda por encima.
    const { data: exentasRows } = await admin
      .from('socio_excepciones').select('socio_id')
      .eq('studio_id', sesion.studioId).eq('tipo', 'SIN_AVISO_HUECO');
    const exentasSet = new Set((exentasRows ?? []).map(r => r.socio_id as string));
    candidatas = candidatas.filter(s => !exentasSet.has(s.id));

    // Consentimiento de marketing (RGPD art. 7 / LSSI art. 21). Esto es un
    // mensaje COMERCIAL por WhatsApp, no un aviso de servicio: invita a
    // reservar. Era la única vía de marketing del producto que no pasaba por
    // este guard — las otras cinco sí (lib/inngest/campanas.ts,
    // marketing-automation-engine, automation-engine, mailchimp, klaviyo).
    // `socio_excepciones/SIN_AVISO_HUECO` NO lo sustituye: es una exclusión que
    // decide la dueña, no un consentimiento que da la socia.
    // El texto completo no viaja en mapSocio (mismo ahorro de payload que
    // aceptacionContrato.versionTexto), así que se trae con un select propio.
    let sinConsentimiento = 0;
    if (candidatas.length) {
      const textoVigente = textoConsentimientoMarketing({ nombre: studioRow?.nombre ?? undefined });
      const { data: consentRows } = await admin
        .from('socios').select('id, consentimiento_marketing_texto')
        .eq('studio_id', sesion.studioId)
        .in('id', candidatas.map(s => s.id));
      const consentimientos = new Map<string, string>();
      for (const row of consentRows ?? []) {
        const texto = row.consentimiento_marketing_texto as string | null;
        if (texto) consentimientos.set(row.id as string, texto);
      }
      const antes = candidatas.length;
      candidatas = filtrarPorConsentimientoMarketing(candidatas, consentimientos, textoVigente);
      sinConsentimiento = antes - candidatas.length;
    }

    // Buzones que ya sabemos rotos (app/api/webhooks/resend → email_rebotes).
    // Escribirles otra vez no es inofensivo: Resend acepta el envío con 200 y
    // un id, lo descarta en silencio, y el panel contaba eso como «1 aviso
    // enviado». Es exactamente lo que pasó el 11-sep-2026 con `meri@gmail.com`.
    // Aquí se saca a esas socias de la lista y se dicen aparte, para que la
    // propietaria sepa que lo que hay que arreglar es el correo de su ficha.
    const correoRotoPorSocia = new Map<string, string>();
    if (candidatas.length) {
      const emails = [...new Set(candidatas.map(s => s.email).filter(Boolean).map(e => normalizarEmail(e!)))];
      if (emails.length) {
        const { data: rebotadas } = await admin.from('email_rebotes').select('email, tipo').in('email', emails);
        const rotos = new Map((rebotadas ?? []).map(r => [r.email as string, r.tipo as string]));
        for (const s of candidatas) {
          const tipo = s.email ? rotos.get(normalizarEmail(s.email)) : undefined;
          if (tipo) correoRotoPorSocia.set(s.id, tipo);
        }
      }
    }

    const nombreClase = tipoRow?.nombre ?? 'pilates';
    const hora = horaEstudio(sesionObj.inicio);
    const fecha = fechaLargaEstudio(sesionObj.inicio);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? LEGAL.url;
    const enlace = studioRow?.slug ? `${appUrl}/reservar/${studioRow.slug}` : appUrl;

    const nombreEstudio = studioRow?.nombre ?? 'el estudio';
    const textoAviso = (nombre: string) =>
      `¡Hola ${nombre}! Se ha quedado un hueco en ${nombreClase} el ${fecha} a las ${hora} en ${nombreEstudio}. Resérvalo aquí: ${enlace}`;
    const emailProvider = resend ? resendEmailProvider(resend) : null;

    let enviados = 0;
    let porWhatsapp = 0;
    let porEmail = 0;
    let sinContacto = 0;
    // Por NOMBRE y no solo un recuento: «1 con el correo mal» obliga a
    // adivinar cuál de las seleccionadas es, y lo único que hay que hacer es
    // abrir SU ficha y corregir la dirección.
    const correoRoto: string[] = [];
    let errores = 0;
    // Una sola escritura de salud por tanda, no una por mensaje — mismo
    // criterio y mismo acumulador que el cron de recordatorios: lo que la
    // pantalla de Integraciones necesita saber es cómo fue la ÚLTIMA
    // conversación con Meta, no las treinta.
    const salud = acumuladorSalud();

    for (const socia of candidatas) {
      // WhatsApp si el estudio lo tiene conectado y ella tiene teléfono; si no,
      // correo. Un solo mensaje por socia — nunca los dos.
      // `esDominioReservado` (RFC 2606, example.com y compañía) es lo que ya
      // hace `enviarEmailTransaccional`, y aquí hace falta igual: una ficha de
      // demo con dirección inventada no es un fallo del correo, así que ni se
      // intenta ni se cuenta como error.
      const porWa = !!whatsapp && !!socia.telefono;
      // Un buzón que ya rebotó no vuelve a intentarse por correo. Si tiene
      // teléfono y el estudio tiene WhatsApp, le sigue llegando por ahí: lo que
      // está roto es la dirección, no la persona.
      const rotoTipo = correoRotoPorSocia.get(socia.id);
      const puedeEmail = !!emailProvider && !!socia.email && !esDominioReservado(socia.email) && !rotoTipo;
      if (!porWa && !puedeEmail) {
        if (rotoTipo) correoRoto.push(socia.nombre); else sinContacto++;
        continue;
      }

      let resultado: { ok: true; id?: string } | { ok: false; error: string };
      if (porWa) {
        // Este aviso lo inicia el negocio (nadie ha escrito al estudio), así que
        // fuera de la ventana de 24h Meta solo entrega una plantilla aprobada:
        // como texto libre devuelve 131047. Sin plantilla registrada se manda
        // texto igualmente —llega a quien SÍ escribió hace poco— en vez de no
        // mandar nada; el error de Meta queda anotado en `avisos_hueco` y en la
        // salud de la integración, que es donde se ve por qué no llegó.
        resultado = whatsapp!.plantillaHueco
          ? await enviarWhatsAppPlantilla(whatsapp!, socia.telefono!, PLANTILLA_HUECO, [
              socia.nombre, nombreClase, fecha, hora, nombreEstudio, enlace,
            ])
          : await enviarWhatsAppTexto(whatsapp!, socia.telefono!, textoAviso(socia.nombre));
        salud.anota(resultado);
      } else {
        const html = await render(AutomatizacionEmail({
          socioNombre: socia.nombre,
          titulo: `Se ha quedado un hueco en ${nombreClase}`,
          mensaje: `Se ha liberado una plaza en ${nombreClase} el ${fecha} a las ${hora}. Si te viene bien, es tuya.`,
          estudioNombre: nombreEstudio,
          logoUrl: studioRow?.logo_url ?? null,
          colorPrimario: studioRow?.color_primario ?? null,
          accion: { url: enlace, texto: 'Reservar mi plaza' },
          // LSSI art. 21: toda comunicación comercial lleva enlace de baja. Y
          // aquí no es solo la ley — el consentimiento que firmó la socia
          // promete literalmente poder darse de baja «desde el enlace de baja
          // de cualquier email». Sin él, el correo incumple su propio permiso.
          unsubscribeUrl: `${appUrl}/api/marketing/baja?token=${firmarBajaMarketing(sesion.studioId, socia.id)}`,
        }));
        // `ResultadoEnvioProvider` es `{ ok: boolean; error?: string }`, no una
        // unión discriminada: se normaliza aquí para que el resto del bucle
        // trate los dos canales igual. Un `ok: false` sin mensaje del proveedor
        // no puede quedarse sin detalle en `avisos_hueco` — la fila es
        // justamente lo que se mira cuando alguien dice que no le llegó.
        const envio = await emailProvider!.enviar({
          to: socia.email,
          subject: `Se ha quedado un hueco en ${nombreClase} — ${fecha}`,
          html,
          studioNombre: nombreEstudio,
          // Determinista por (sesión, socia): si la propietaria pulsa dos veces
          // o la petición se reintenta, Resend reconoce la clave y no reenvía.
          // El dedupe de 24h de `avisos_hueco` cubre el caso normal; esto cubre
          // el que ocurre ANTES de que se escriba esa fila.
          idempotencyKey: `hueco-${sesionId}-${socia.id}`,
        });
        resultado = envio.ok
          ? { ok: true, id: envio.id }
          : { ok: false, error: envio.error ?? 'El proveedor de email rechazó el envío' };
      }

      if (resultado.ok) { enviados++; if (porWa) porWhatsapp++; else porEmail++; } else errores++;
      await admin.from('avisos_hueco').insert({
        id: `hueco-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        studio_id: sesion.studioId,
        sesion_id: sesionId,
        socio_id: socia.id,
        canal: porWa ? 'WHATSAPP' : 'EMAIL',
        resultado: resultado.ok ? 'ok' : 'error',
        detalle: resultado.ok ? null : resultado.error ?? 'error desconocido',
      });
    }

    // `null` cuando no se intentó ningún envío por WhatsApp: sin noticia nueva
    // del servicio, sobrescribir la salud borraría la que sí valía.
    const resultadoSalud = salud.resultado();
    if (resultadoSalud) await registrarSaludIntegracion(admin, sesion.studioId, 'WHATSAPP', resultadoSalud);

    return NextResponse.json({
      enviados, porWhatsapp, porEmail, errores, sinConsentimiento,
      // Se llamaba `sinTelefono` cuando WhatsApp era el único canal. Ahora
      // «sin contacto» es de verdad sin ninguna vía: ni teléfono utilizable ni
      // correo.
      sinContacto,
      // Aparte de `sinContacto` a propósito: aquí SÍ hay un correo escrito en la
      // ficha, lo que pasa es que no funciona. Son dos arreglos distintos —
      // pedirle el contacto a la socia, o corregir una errata.
      correoRoto,
      // Compatibilidad de forma con el resto de contadores de esta respuesta,
      // que son números: quien solo quiera contar no tiene que saber que el
      // otro campo es una lista.
      conCorreoRoto: correoRoto.length,
      saltadasPorDedup,
    });
  } catch (err) {
    return errorInterno('marketing/hueco/avisar:POST', err, 'No se pudo avisar a las candidatas. Inténtalo de nuevo más tarde.');
  }
}
