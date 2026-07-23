import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { enviarMensajeTwilio, twilioConfigurado } from '@/lib/twilio';
import { clasesConHuecoProximas, candidatasParaHueco } from '@/lib/booking-logic';
import { mapSesion, mapReserva, mapSocio, mapSuscripcion, mapPlanTarifa } from '@/lib/supabase-data';
import type { RowSesiones, RowReservas, RowSocios, RowSuscripciones, RowPlanesTarifa } from '@/lib/db-types';

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
    const planesTarifa = (planesRows ?? []).map(r => mapPlanTarifa(r as RowPlanesTarifa));

    // Confirma que sigue siendo una sesión futura por debajo del umbral —
    // protege contra un doble clic sobre datos ya obsoletos.
    const ahora = new Date();
    const huecos = clasesConHuecoProximas({ sesiones: [sesionObj], reservas, ahora });
    if (huecos.length === 0) {
      return NextResponse.json({ error: 'Esta clase ya no tiene hueco (o ya no está en la ventana de aviso)' }, { status: 409 });
    }
    const { huecos: plazasLibres } = huecos[0];

    const hoyISO = ahora.toISOString().slice(0, 10);
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

    const nombreClase = tipoRow?.nombre ?? 'pilates';
    const hora = new Date(sesionObj.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const fecha = new Date(sesionObj.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tentare.app';
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

    return NextResponse.json({ enviados, sinTelefono, errores, saltadasPorDedup: avisadasSet.size });
  } catch (err) {
    return errorInterno('marketing/hueco/avisar:POST', err, 'No se pudo avisar a las candidatas. Inténtalo de nuevo más tarde.');
  }
}
