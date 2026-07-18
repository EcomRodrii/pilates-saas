import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';
import { enviarEmailContactoSustituta } from '@/lib/sustituciones/email';

// Fecha/hora de la clase en texto legible (España).
function formatCuando(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha} · ${hora}`;
}

// Estados que se consideran "activos" (una baja en curso). Coincide con el índice
// único parcial `uq_sustitucion_activa_por_sesion` de la migración 0037.
const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

// POST /api/sustituciones — marcar una baja: "no puedo dar esta clase".
// Crea la sustitución (idempotente), calcula el ranking de candidatas con
// motivos humanos y la deja lista según el modo de autonomía del estudio.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sesionId?: string; motivo?: string } | null;
  const sesionId = typeof body?.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase (sesionId)' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 500) || null : null;

  // La clase debe existir y ser de este estudio.
  const { data: clase } = await admin
    .from('sesiones').select('id, studio_id, instructor_id, cancelada')
    .eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!clase) return NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 });
  if (clase.cancelada) return NextResponse.json({ error: 'La clase ya está cancelada' }, { status: 409 });

  // Idempotencia (rápida): si ya hay una sustitución activa para esta clase, la devuelve.
  const { data: existente } = await admin
    .from('sustituciones').select('*')
    .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
  if (existente) return NextResponse.json({ sustitucion: existente, yaExistia: true });

  // Modo de autonomía del estudio (0039).
  const { data: estudio } = await admin
    .from('studios').select('modo_autonomia').eq('id', sesion.studioId).maybeSingle();
  const modo = (estudio?.modo_autonomia as string) ?? 'asistido';

  // Scoring: top-3 de candidatas con motivos en lenguaje humano (función 0038).
  const { data: ranking, error: errRank } = await admin.rpc('rankear_candidatas', { p_sesion_id: sesionId });
  if (errRank) return NextResponse.json({ error: errRank.message }, { status: 500 });

  // manual/asistido → espera aprobación de la propietaria; autonomo/vacaciones →
  // pasa a contactar (el cron de contacto es la fase siguiente).
  const estado = modo === 'autonomo' || modo === 'vacaciones' ? 'contactando' : 'pendiente_aprobacion';

  const nueva = {
    id: `sust-${uid()}`,
    studio_id: sesion.studioId,
    sesion_id: sesionId,
    instructor_original_id: clase.instructor_id,
    motivo,
    estado,
    ranking: ranking ?? [],
    candidata_actual: 0,
  };

  const { data: insertada, error: errIns } = await admin
    .from('sustituciones').insert(nueva).select('*').single();

  if (errIns) {
    // Choque con el índice único parcial (dos bajas simultáneas de la misma
    // clase) → gana la primera; devolvemos la activa en vez de crear otra.
    if (errIns.code === '23505') {
      const { data: activa } = await admin
        .from('sustituciones').select('*')
        .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
      if (activa) return NextResponse.json({ sustitucion: activa, yaExistia: true });
    }
    return NextResponse.json({ error: errIns.message }, { status: 500 });
  }

  return NextResponse.json({ sustitucion: insertada, yaExistia: false });
}

// GET /api/sustituciones — lista las sustituciones del estudio (activas +
// resueltas recientes) con el ranking y los datos de la clase, para el panel.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('sustituciones')
    .select('id, estado, motivo, creado_en, resuelto_en, instructor_original_id, sustituta_final_id, ranking, sesion_id, sesiones(inicio, fin, tipo_clase_id, cancelada)')
    .eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sustituciones: data ?? [] });
}

// PATCH /api/sustituciones — confirmar una candidata (aceptación atómica) o
// descartar la sustitución ("resuelto fuera del sistema").
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { sustitucionId?: string; action?: string; instructorId?: string } | null;
  const sustitucionId = typeof body?.sustitucionId === 'string' ? body.sustitucionId : null;
  if (!sustitucionId) return NextResponse.json({ error: 'Falta sustitucionId' }, { status: 400 });

  if (body?.action === 'confirmar') {
    const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
    if (!instructorId) return NextResponse.json({ error: 'Falta la candidata (instructorId)' }, { status: 400 });

    // Aceptación atómica + reasignación de la clase, en una transacción (función 0040).
    const { data, error } = await admin.rpc('confirmar_sustitucion', {
      p_sustitucion_id: sustitucionId,
      p_instructor_id: instructorId,
      p_studio_id: sesion.studioId,
      p_aprobada_por: sesion.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (!r.ok) return NextResponse.json({ error: 'Esta sustitución ya está resuelta', ...r }, { status: 409 });
    return NextResponse.json(r);
  }

  if (body?.action === 'contactar') {
    const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
    if (!instructorId) return NextResponse.json({ error: 'Falta la candidata (instructorId)' }, { status: 400 });

    // Sustitución activa de este estudio + la clase.
    const { data: sust } = await admin
      .from('sustituciones')
      .select('id, estado, ranking, sesion_id, sesiones(inicio, tipo_clase_id)')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });
    if (!['buscando', 'pendiente_aprobacion', 'contactando'].includes(sust.estado as string)) {
      return NextResponse.json({ error: 'Esta sustitución ya está resuelta' }, { status: 409 });
    }

    // La candidata + su email.
    const { data: cand } = await admin
      .from('instructores').select('nombre, email')
      .eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!cand) return NextResponse.json({ error: 'Candidata no encontrada' }, { status: 404 });
    if (!cand.email) {
      return NextResponse.json({ error: `${cand.nombre} no tiene email. Añádeselo en Equipo para poder avisarla.` }, { status: 422 });
    }

    const ses = (Array.isArray(sust.sesiones) ? sust.sesiones[0] : sust.sesiones) as
      { inicio: string; tipo_clase_id: string | null } | null;
    const [{ data: tipo }, { data: estudio }] = await Promise.all([
      admin.from('tipos_clase').select('nombre').eq('id', ses?.tipo_clase_id ?? '').maybeSingle(),
      admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle(),
    ]);

    // Token de aceptación (un solo uso, ventana corta, ligado a esta sustitución).
    const token = firmarTokenInstructora(instructorId, sesion.studioId, 'aceptar_sustitucion', sustitucionId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const url = `${appUrl}/aceptar-sustitucion/${token}`;

    // Marca contactando + índice de la candidata dentro del ranking.
    const ranking = (Array.isArray(sust.ranking) ? sust.ranking : []) as { instructor_id: string }[];
    const idx = Math.max(0, ranking.findIndex(c => c.instructor_id === instructorId));
    await admin.from('sustituciones')
      .update({ estado: 'contactando', candidata_actual: idx })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId);

    // Registra el intento de contacto (con el token del deep link).
    await admin.from('sustitucion_contactos').insert({
      id: `cont-${uid()}`,
      studio_id: sesion.studioId,
      sustitucion_id: sustitucionId,
      instructor_id: instructorId,
      canal: 'email',
      estado: 'enviado',
      token,
    });

    // Envía el email (degradación limpia si Resend no está configurado).
    const envio = await enviarEmailContactoSustituta({
      to: cand.email,
      toName: cand.nombre,
      estudioNombre: estudio?.nombre ?? 'Tu estudio',
      claseNombre: tipo?.nombre ?? 'Clase',
      cuando: ses?.inicio ? formatCuando(ses.inicio) : '',
      url,
    });

    return NextResponse.json({
      ok: true,
      candidata: cand.nombre,
      emailEnviado: 'ok' in envio && envio.ok === true,
      emailSkipped: 'skipped' in envio,
    });
  }

  if (body?.action === 'descartar') {
    const { error } = await admin
      .from('sustituciones')
      .update({ estado: 'resuelta_fuera', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId)
      .in('estado', ['buscando', 'pendiente_aprobacion', 'contactando']);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
