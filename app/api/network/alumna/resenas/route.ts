import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';

// Reseñas de ALUMNA → estudio/instructora — última pieza de F3. Gate
// ESTRICTO, mismo criterio que el lado estudio→instructora
// (app/api/network/resenas/route.ts, tieneClaseCompletada): reserva
// CONFIRMADA + clase ya pasada. Auth con verificarUsuarioSupabase (JWT de
// alumna), NUNCA verificarSesionStaff — mismo patrón que
// app/api/network/alumna/favoritos/route.ts.
//
// Una reseña de estudio no tiene perfil_id (red_perfiles solo tiene
// instructoras, no hay fila de "perfil del estudio") — migración
// 20260825004019 hizo perfil_id nullable en red_resenas exactamente para
// este caso, y sustituyó el unique (studio_id, perfil_id) GLOBAL por dos
// índices únicos parciales (uno por solicitud_id, otro por reserva_id):
// cada relación validada da derecho a una reseña, sin que dos alumnas
// distintas que reseñan a la misma instructora en el mismo estudio choquen
// entre sí.

// Devuelve además reservaId de UNA reserva real que satisface el gate —
// hace falta para rellenar red_resenas.reserva_id al insertar, que forma
// parte del CHECK de exclusión (red_resenas_gate_unico).
async function tieneClaseCompletadaEstudio(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, authUserId: string, studioId: string,
): Promise<{ ok: boolean; reservaId: string | null }> {
  const { data: socios } = await admin.from('socios').select('id')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId);
  const socioIds = (socios ?? []).map(s => s.id as string);
  if (socioIds.length === 0) return { ok: false, reservaId: null };

  // Cualquier reserva que satisfaga el gate vale — solo hace falta UNA
  // relación real para justificar la reseña, no la más reciente en
  // concreto. Mismo criterio que tieneClaseCompletadaInstructora.
  const { data: reservas } = await admin.from('reservas')
    .select('id, sesiones!inner(inicio, cancelada)')
    .eq('studio_id', studioId).in('socio_id', socioIds).eq('estado', 'CONFIRMADA')
    .eq('sesiones.cancelada', false).lt('sesiones.inicio', new Date().toISOString())
    .limit(1);

  const fila = (reservas ?? [])[0] as { id: string } | undefined;
  if (!fila) return { ok: false, reservaId: null };
  return { ok: true, reservaId: fila.id };
}

// Devuelve además studioId/reservaId de UNA reserva real que satisface el
// gate (la más reciente) — hacen falta para rellenar red_resenas.studio_id/
// reserva_id al insertar, que son NOT NULL/parte del CHECK de exclusión.
async function tieneClaseCompletadaInstructora(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, authUserId: string, instructoraAuthUserId: string,
): Promise<{ ok: boolean; studioId: string | null; reservaId: string | null }> {
  const { data: instructores } = await admin.from('instructores').select('id')
    .eq('auth_user_id', instructoraAuthUserId);
  const instructorIds = (instructores ?? []).map(i => i.id as string);
  if (instructorIds.length === 0) return { ok: false, studioId: null, reservaId: null };

  const { data: socios } = await admin.from('socios').select('id').eq('auth_user_id', authUserId);
  const socioIds = (socios ?? []).map(s => s.id as string);
  if (socioIds.length === 0) return { ok: false, studioId: null, reservaId: null };

  // Cualquier reserva que satisfaga el gate vale — solo hace falta UNA
  // relación real para justificar la reseña, no la más reciente en
  // concreto. Sin `.order()` sobre columna embebida (no hay precedente de
  // ese patrón en el repo y no aporta nada aquí).
  const { data: reservas } = await admin.from('reservas')
    .select('id, studio_id, sesiones!inner(inicio, cancelada, instructor_id)')
    .in('socio_id', socioIds).eq('estado', 'CONFIRMADA').eq('sesiones.cancelada', false)
    .in('sesiones.instructor_id', instructorIds).lt('sesiones.inicio', new Date().toISOString())
    .limit(1);

  const fila = (reservas ?? [])[0] as { id: string; studio_id: string } | undefined;
  if (!fila) return { ok: false, studioId: null, reservaId: null };
  return { ok: true, studioId: fila.studio_id, reservaId: fila.id };
}

type Tipo = 'estudio' | 'instructora';

function leerTipo(req: NextRequest): Tipo | null {
  const tipo = req.nextUrl.searchParams.get('tipo');
  return tipo === 'estudio' || tipo === 'instructora' ? tipo : null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarUsuarioSupabase(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tipo = leerTipo(req);
  if (!tipo) return errorPeticion('Falta el tipo de reseña.');

  if (tipo === 'estudio') {
    const studioId = req.nextUrl.searchParams.get('studioId');
    if (!studioId) return errorPeticion('Falta el estudio.');

    const gate = await tieneClaseCompletadaEstudio(admin, sesion.userId, studioId);
    // `.is('perfil_id', null)` para no confundir con una reseña de
    // instructora ya hecha por la misma alumna en el mismo estudio.
    const { data: existente } = await admin.from('red_resenas').select('id')
      .eq('studio_id', studioId).eq('autor', sesion.userId)
      .is('perfil_id', null).not('reserva_id', 'is', null).maybeSingle();

    return NextResponse.json({
      elegible: gate.ok && !existente,
      disponible: true,
      yaResenado: Boolean(existente),
      faltaClaseCompletada: !gate.ok,
    });
  }

  const perfilId = req.nextUrl.searchParams.get('perfilId');
  if (!perfilId) return errorPeticion('Falta el perfil.');

  const { data: perfil } = await admin.from('red_perfiles').select('auth_user_id').eq('id', perfilId).maybeSingle();
  const gate = perfil
    ? await tieneClaseCompletadaInstructora(admin, sesion.userId, perfil.auth_user_id)
    : { ok: false, studioId: null, reservaId: null };

  const { data: existente } = await admin.from('red_resenas').select('id')
    .eq('perfil_id', perfilId).eq('autor', sesion.userId).not('reserva_id', 'is', null).maybeSingle();

  return NextResponse.json({
    elegible: gate.ok && !existente,
    disponible: true,
    yaResenado: Boolean(existente),
    faltaClaseCompletada: !gate.ok,
  });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarUsuarioSupabase(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { tipo?: unknown; perfilId?: unknown; studioId?: unknown; puntuacion?: unknown; comentario?: unknown } | null;
  const tipo = body?.tipo === 'estudio' || body?.tipo === 'instructora' ? body.tipo : null;
  const puntuacion = typeof body?.puntuacion === 'number' ? body.puntuacion : null;
  const comentario = typeof body?.comentario === 'string' && body.comentario.trim() ? body.comentario.trim() : null;
  if (!tipo || puntuacion == null || !Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return errorPeticion('Datos no válidos.');
  }

  if (tipo === 'estudio') {
    const studioId = typeof body?.studioId === 'string' ? body.studioId : null;
    if (!studioId) return errorPeticion('Falta el estudio.');

    const gate = await tieneClaseCompletadaEstudio(admin, sesion.userId, studioId);
    if (!gate.ok || !gate.reservaId) {
      return errorPeticion('Solo puedes reseñar un estudio donde ya hayas completado una clase.', 403);
    }

    const { error } = await admin.from('red_resenas').insert({
      id: `redresena-${uid()}`,
      perfil_id: null,
      studio_id: studioId,
      solicitud_id: null,
      reserva_id: gate.reservaId,
      autor: sesion.userId,
      puntuacion,
      comentario,
    });
    if (error) {
      if (error.code === '23505') return errorPeticion('Ya hay una reseña registrada para esta clase.', 409);
      return errorInterno('network:alumna:resenas:POST', error, 'No se ha podido enviar la reseña.');
    }

    return NextResponse.json({ ok: true });
  }

  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  if (!perfilId) return errorPeticion('Falta el perfil.');

  const { data: perfil } = await admin.from('red_perfiles').select('auth_user_id').eq('id', perfilId).maybeSingle();
  const gate = perfil
    ? await tieneClaseCompletadaInstructora(admin, sesion.userId, perfil.auth_user_id)
    : { ok: false, studioId: null, reservaId: null };
  if (!gate.ok || !gate.studioId || !gate.reservaId) {
    return errorPeticion('Solo puedes reseñar a una instructora con la que ya hayas completado una clase.', 403);
  }

  const { error } = await admin.from('red_resenas').insert({
    id: `redresena-${uid()}`,
    perfil_id: perfilId,
    studio_id: gate.studioId,
    solicitud_id: null,
    reserva_id: gate.reservaId,
    autor: sesion.userId,
    puntuacion,
    comentario,
  });
  if (error) {
    if (error.code === '23505') return errorPeticion('Ya hay una reseña registrada para esta instructora en este estudio.', 409);
    return errorInterno('network:alumna:resenas:POST', error, 'No se ha podido enviar la reseña.');
  }

  return NextResponse.json({ ok: true });
}
