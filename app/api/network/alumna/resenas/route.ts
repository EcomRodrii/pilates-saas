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
// ⚠️ HALLAZGO DE ESQUEMA, no reinventado a mano aquí: `red_resenas.perfil_id`
// sigue siendo NOT NULL (verificado en vivo, tabla real de producción) — la
// migración de F0 (20260824191315_red_resenas_gate_alumna.sql) hizo
// `solicitud_id` nullable y añadió `reserva_id`, pero NUNCA tocó
// `perfil_id`/`studio_id`, que siguen NOT NULL los dos. Eso permite insertar
// una reseña de alumna sobre una INSTRUCTORA (perfil_id = la instructora,
// studio_id = el estudio donde completó la clase con ella — ambos derivables
// de la reserva real). Pero una reseña sobre un ESTUDIO sin más no tiene
// ningún perfil_id natural que rellenar: red_perfiles es una tabla de
// instructoras, no hay fila de "perfil del estudio". Insertar ahí exigiría
// una migración (perfil_id nullable + CHECK ajustado), fuera de alcance de
// esta pieza ("ninguna migración"). Por eso tipo='estudio' calcula la
// elegibilidad real (útil para diagnóstico/futuro) pero `disponible` viene
// siempre a `false` y el POST la rechaza explícitamente en vez de fallar en
// silencio contra el NOT NULL de Postgres.
//
// ⚠️ Límite heredado, no introducido aquí: `unique (studio_id, perfil_id)`
// en red_resenas es GLOBAL a la combinación, no por autor — pensado
// originalmente para "una relación validada, una reseña" del lado estudio→
// instructora (una única solicitud aceptada posible). Del lado alumna, dos
// alumnas distintas que completaron clase con la MISMA instructora en el
// MISMO estudio compiten por esa única fila: la primera en enviar se queda
// con el hueco, la segunda recibe 409 aunque sea SU primera reseña. No se
// puede arreglar sin migración (mismo motivo de arriba) — se documenta el
// límite, no se enmascara.
async function tieneClaseCompletadaEstudio(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, authUserId: string, studioId: string,
): Promise<boolean> {
  const { data: socios } = await admin.from('socios').select('id')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId);
  const socioIds = (socios ?? []).map(s => s.id as string);
  if (socioIds.length === 0) return false;

  const { count } = await admin.from('reservas')
    .select('id, sesiones!inner(inicio, cancelada)', { count: 'exact', head: true })
    .eq('studio_id', studioId).in('socio_id', socioIds).eq('estado', 'CONFIRMADA')
    .eq('sesiones.cancelada', false).lt('sesiones.inicio', new Date().toISOString());
  return (count ?? 0) > 0;
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

    const claseCompletada = await tieneClaseCompletadaEstudio(admin, sesion.userId, studioId);
    const { data: existente } = await admin.from('red_resenas').select('id')
      .eq('studio_id', studioId).eq('autor', sesion.userId).not('reserva_id', 'is', null).maybeSingle();

    return NextResponse.json({
      // `disponible: false` a propósito — ver comentario de cabecera. Nunca
      // true aunque haya clase completada: el esquema no puede almacenar
      // esta reseña todavía.
      elegible: false,
      disponible: false,
      yaResenado: Boolean(existente),
      faltaClaseCompletada: !claseCompletada,
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
    // Ver comentario de cabecera: perfil_id es NOT NULL en red_resenas y no
    // hay ningún perfil natural para "el estudio en sí" — sin migración no
    // se puede insertar esto de forma honesta. Se rechaza explícito en vez
    // de dejar que Postgres lo tumbe con un 23502 genérico.
    return errorPeticion('Las reseñas sobre un estudio todavía no están disponibles.', 501);
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
