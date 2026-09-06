import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { enviarMensajeTwilio, twilioConfigurado } from '@/lib/twilio';
import { clasesConHuecoProximas, candidatasParaHueco } from '@/lib/booking-logic';
import { mapSesion, mapReserva, mapSocio, mapSuscripcion, mapPlanTarifa, hidratarTiposDePlanes } from '@/lib/supabase-data';
import type { RowSesiones, RowReservas, RowSocios, RowSuscripciones, RowPlanesTarifa } from '@/lib/db-types';
import { LEGAL } from '@/lib/legal-info';
import { filtrarPorConsentimientoMarketing } from '@/lib/marketing/consentimiento';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { fechaLargaEstudio, horaEstudio, hoyEnEstudio } from '@/lib/utils';

// Radar de ocupación → "Avisar a candidatas" (Configuración → Dashboard).
// Server-only: manda WhatsApp real con credenciales de plataforma y necesita
// límite de gasto/spam — no hay ningún rate-limit de mensajería en el repo
// hasta esta ruta, así que se incorpora aquí desde el principio.
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
  if (!twilioConfigurado('WHATSAPP')) {
    return NextResponse.json({ error: 'WhatsApp no está configurado en la plataforma' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { sesionId?: string } | null;
  const sesionId = body?.sesionId;
  if (!sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

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
      admin.from('studios').select('nombre, slug').eq('id', sesion.studioId).single(),
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

    // Cap: no tiene sentido avisar a mucha más gente que huecos reales.
    const cap = Math.min(candidatas.length, plazasLibres * 4, CAP_MAXIMO);
    candidatas = candidatas.slice(0, cap);

    // Dedup: no volver a avisar a la misma socia de la misma sesión en 24h.
    const desdeDedup = new Date(ahora.getTime() - VENTANA_DEDUP_HORAS * 3600_000).toISOString();
    const { data: yaAvisadas } = await admin
      .from('avisos_hueco').select('socio_id')
      .eq('sesion_id', sesionId).gte('enviado_en', desdeDedup);
    const avisadasSet = new Set((yaAvisadas ?? []).map(r => r.socio_id as string));
    candidatas = candidatas.filter(s => !avisadasSet.has(s.id));

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

    const nombreClase = tipoRow?.nombre ?? 'pilates';
    const hora = horaEstudio(sesionObj.inicio);
    const fecha = fechaLargaEstudio(sesionObj.inicio);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? LEGAL.url;
    const enlace = studioRow?.slug ? `${appUrl}/reservar/${studioRow.slug}` : appUrl;

    let enviados = 0;
    let sinTelefono = 0;
    let errores = 0;

    for (const socia of candidatas) {
      if (!socia.telefono) { sinTelefono++; continue; }
      const cuerpo = `¡Hola ${socia.nombre}! Se ha quedado un hueco en ${nombreClase} el ${fecha} a las ${hora} en ${studioRow?.nombre ?? 'el estudio'}. Resérvalo aquí: ${enlace}`;
      const resultado = await enviarMensajeTwilio({ canal: 'WHATSAPP', to: socia.telefono, cuerpo });
      if (resultado.ok) enviados++; else errores++;
      await admin.from('avisos_hueco').insert({
        id: `hueco-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        studio_id: sesion.studioId,
        sesion_id: sesionId,
        socio_id: socia.id,
        resultado: resultado.ok ? 'ok' : 'error',
        detalle: resultado.ok ? null : resultado.error ?? 'error desconocido',
      });
    }

    return NextResponse.json({ enviados, sinTelefono, errores, sinConsentimiento, saltadasPorDedup: avisadasSet.size });
  } catch (err) {
    return errorInterno('marketing/hueco/avisar:POST', err, 'No se pudo avisar a las candidatas. Inténtalo de nuevo más tarde.');
  }
}
