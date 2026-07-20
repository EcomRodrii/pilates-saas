import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';
import { contactarCandidata, contactarDesde, ESTADOS_EN_JUEGO, type RankingItem } from '@/lib/sustituciones/contacto';

// Estados que se consideran "activos" (una baja en curso). Coincide con el índice
// único parcial `uq_sustitucion_activa_por_sesion` de la migración 0037.
const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

// Emite el evento de escalado. Best-effort: si el bus de Inngest falla, el contacto
// ya se hizo (email enviado) — el escalado es una capa de resiliencia encima, no
// debe tumbar la petición del usuario.
async function emitirEscalado(data: { sustitucionId: string; studioId: string; instructorId: string; idx: number }) {
  try {
    await inngest.send({ name: EVENTS.SUSTITUCION_CONTACTADA, data });
  } catch (e) {
    console.error('[sustituciones] no se pudo emitir el evento de escalado', e);
  }
}

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
    .from('sesiones').select('id, studio_id, instructor_id, cancelada, inicio, tipo_clase_id')
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

  // asistido → espera el visto bueno de la propietaria; autonomo/vacaciones →
  // arranca en 'contactando' y más abajo se avisa sola a la 1ª candidata.
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

  // Modo autónomo/vacaciones: la dueña ha "desaparecido" → el motor contacta solo
  // a la primera candidata contactable y arranca el escalado. En asistido no se
  // contacta a nadie aquí (espera el visto bueno de la propietaria en el panel).
  if (insertada.estado === 'contactando') {
    const rank = (Array.isArray(ranking) ? ranking : []) as RankingItem[];
    const sesionMin = { inicio: clase.inicio as string, tipo_clase_id: clase.tipo_clase_id as string | null };
    const r = await contactarDesde(admin, {
      sustitucionId: insertada.id, studioId: sesion.studioId, sesion: sesionMin, ranking: rank, desde: 0,
    });
    if (r.contactada) {
      await emitirEscalado({ sustitucionId: insertada.id, studioId: sesion.studioId, instructorId: r.instructorId, idx: r.idx });
    }
    // Si nadie es contactable (ranking vacío o sin emails), la baja queda en
    // 'contactando' con el ranking vacío → el panel muestra "cancelar clase".
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

  const { data: estudio } = await admin
    .from('studios').select('avisar_alumnas').eq('id', sesion.studioId).maybeSingle();

  return NextResponse.json({ sustituciones: data ?? [], avisarAlumnas: !!estudio?.avisar_alumnas });
}

// PATCH /api/sustituciones — confirmar una candidata (aceptación atómica) o
// descartar la sustitución ("resuelto fuera del sistema").
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { sustitucionId?: string; action?: string; instructorId?: string; avisar?: boolean } | null;

  // Toggle de "avisar a alumnas" (ajuste del estudio, no necesita sustitución).
  if (body?.action === 'config_avisar') {
    if (typeof body?.avisar !== 'boolean') return NextResponse.json({ error: 'Falta el valor' }, { status: 400 });
    if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria' }, { status: 403 });
    const { error } = await admin.from('studios').update({ avisar_alumnas: body.avisar }).eq('id', sesion.studioId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, avisarAlumnas: body.avisar });
  }

  const sustitucionId = typeof body?.sustitucionId === 'string' ? body.sustitucionId : null;
  if (!sustitucionId) return NextResponse.json({ error: 'Falta sustitucionId' }, { status: 400 });

  if (body?.action === 'confirmar') {
    const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
    if (!instructorId) return NextResponse.json({ error: 'Falta la candidata (instructorId)' }, { status: 400 });

    // Aceptación atómica + reasignación de la clase, en una transacción (función
    // 0040, con re-check de solape por exclusion constraint desde 0048).
    const { data, error } = await admin.rpc('confirmar_sustitucion', {
      p_sustitucion_id: sustitucionId,
      p_instructor_id: instructorId,
      p_studio_id: sesion.studioId,
      p_aprobada_por: sesion.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
    if (!r.ok) {
      const mensaje = r.motivo === 'conflicto_horario'
        ? 'No se puede: esta instructora ya tiene otra clase en ese horario. Elige otra candidata.'
        : 'Esta sustitución ya está resuelta';
      return NextResponse.json({ error: mensaje, ...r }, { status: 409 });
    }

    // Aviso a las alumnas (si el estudio lo tiene activado): "tu clase sigue en pie".
    let alumnas = { avisadas: 0, total: 0, skipped: false, desactivado: true };
    if (r.sesion_id) {
      const { data: cand } = await admin.from('instructores').select('nombre').eq('id', instructorId).maybeSingle();
      alumnas = await avisarAlumnas(admin, {
        sesionId: r.sesion_id, studioId: sesion.studioId, tipo: 'cubierta', sustituta: cand?.nombre,
      });
    }
    return NextResponse.json({ ...r, alumnas });
  }

  if (body?.action === 'cancelar_clase') {
    // No hay sustituta posible: cancela la clase y avisa a las alumnas (que se
    // enteren por el estudio, no en la puerta — el miedo nº1 de la propietaria).
    const { data: sust } = await admin
      .from('sustituciones').select('id, estado, sesion_id')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });

    await admin.from('sesiones').update({ cancelada: true }).eq('id', sust.sesion_id).eq('studio_id', sesion.studioId);
    await admin.from('sustituciones')
      .update({ estado: 'sin_sustituta', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId);

    const alumnas = await avisarAlumnas(admin, {
      sesionId: sust.sesion_id as string, studioId: sesion.studioId, tipo: 'cancelada',
    });
    return NextResponse.json({ ok: true, alumnas });
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
    if (!ESTADOS_EN_JUEGO.includes(sust.estado as string)) {
      return NextResponse.json({ error: 'Esta sustitución ya está resuelta' }, { status: 409 });
    }

    // Índice de la candidata dentro del ranking (0 si no aparece, p.ej. elección manual).
    const ranking = (Array.isArray(sust.ranking) ? sust.ranking : []) as RankingItem[];
    const idx = Math.max(0, ranking.findIndex(c => c.instructor_id === instructorId));
    const ses = (Array.isArray(sust.sesiones) ? sust.sesiones[0] : sust.sesiones) as
      { inicio: string; tipo_clase_id: string | null } | null;

    // Contacta (marca contactando + registra intento + email) vía helper compartido.
    const r = await contactarCandidata(admin, {
      sustitucionId, studioId: sesion.studioId, instructorId, idx, sesion: ses,
    });
    if (!r.ok && r.motivo === 'sin_email') {
      return NextResponse.json({ error: `${r.candidata ?? 'Esta candidata'} no tiene email. Añádeselo en Equipo para poder avisarla.` }, { status: 422 });
    }
    if (!r.ok) return NextResponse.json({ error: 'No se pudo avisar a la candidata' }, { status: 422 });

    // Arranca el escalado (recordatorio → WhatsApp → alerta/avance).
    await emitirEscalado({ sustitucionId, studioId: sesion.studioId, instructorId, idx });

    return NextResponse.json({
      ok: true,
      candidata: r.candidata,
      emailEnviado: r.emailEnviado,
      emailSkipped: r.emailSkipped,
    });
  }

  if (body?.action === 'descartar') {
    const { error } = await admin
      .from('sustituciones')
      .update({ estado: 'resuelta_fuera', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId)
      .in('estado', ESTADOS_EN_JUEGO);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
