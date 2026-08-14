import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';

// Reseñas — brief §25/§9. Antes solo exigía una solicitud de contacto
// ACEPTADA; siguiente fase (pedida explícitamente): "una vez la instructora
// ya tenga 1 clase completada [pueden] tener permisos de poner reseñas" —
// el contacto aceptado sigue siendo necesario (es la relación validada),
// pero ya no basta: hace falta al menos una clase real ya impartida PARA
// ESTE ESTUDIO. Una por relación (unique studio_id+perfil_id) — reseñar de
// nuevo simplemente falla con 409, no hay edición en esta ronda.
//
// P2-14 (instructora en varias sedes de la misma cadena): la misma persona
// puede tener varias filas en `instructores`, una por sede. "Clase
// completada" se resuelve SIEMPRE con studio_id explícito — sin ese filtro,
// un estudio podría reseñar basándose en clases dadas en OTRA sede de la
// cadena, la misma fuga que el resto del repo ya tiene cuidado de acotar.
async function tieneClaseCompletada(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, authUserId: string, studioId: string,
): Promise<boolean> {
  const { data: ficha } = await admin.from('instructores')
    .select('id').eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  if (!ficha) return false;

  const { count } = await admin.from('sesiones')
    .select('id', { count: 'exact', head: true })
    .eq('instructor_id', ficha.id).eq('studio_id', studioId)
    .eq('cancelada', false).lt('inicio', new Date().toISOString());
  return (count ?? 0) > 0;
}

// GET: elegibilidad — antes de pintar el formulario, el panel pregunta si
// esta combinación estudio+perfil puede reseñar (sí ya reseñó, no vuelve a
// mostrar el formulario; si aún no dio ninguna clase, tampoco).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = req.nextUrl.searchParams.get('perfilId');
  if (!perfilId) return errorPeticion('Falta el perfil.');

  const [{ data: solicitudAceptada }, { data: resenaExistente }, { data: perfil }] = await Promise.all([
    admin.from('red_solicitudes_contacto').select('id')
      .eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).eq('estado', 'aceptada')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    admin.from('red_resenas').select('id').eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).maybeSingle(),
    admin.from('red_perfiles').select('auth_user_id').eq('id', perfilId).maybeSingle(),
  ]);

  const claseCompletada = perfil ? await tieneClaseCompletada(admin, perfil.auth_user_id, sesion.studioId) : false;

  return NextResponse.json({
    elegible: Boolean(solicitudAceptada) && !resenaExistente && claseCompletada,
    yaResenado: Boolean(resenaExistente),
    // Distingue las dos causas de "no elegible" — "aún no ha aceptado
    // contacto" no es lo mismo que "aceptó, pero todavía no ha dado
    // ninguna clase", y la propietaria necesita saber cuál es.
    faltaClaseCompletada: Boolean(solicitudAceptada) && !resenaExistente && !claseCompletada,
  });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { perfilId?: unknown; puntuacion?: unknown; comentario?: unknown } | null;
  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  const puntuacion = typeof body?.puntuacion === 'number' ? body.puntuacion : null;
  const comentario = typeof body?.comentario === 'string' && body.comentario.trim() ? body.comentario.trim() : null;
  if (!perfilId || puntuacion == null || !Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return errorPeticion('Datos no válidos.');
  }

  const [{ data: solicitud }, { data: perfil }] = await Promise.all([
    admin.from('red_solicitudes_contacto').select('id')
      .eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).eq('estado', 'aceptada')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    admin.from('red_perfiles').select('auth_user_id').eq('id', perfilId).maybeSingle(),
  ]);
  if (!solicitud) return errorPeticion('Solo puedes reseñar a una profesional con la que hayas tenido contacto aceptado.', 403);
  if (!perfil || !(await tieneClaseCompletada(admin, perfil.auth_user_id, sesion.studioId))) {
    return errorPeticion('Solo puedes reseñar a una profesional que ya haya impartido al menos una clase para tu estudio.', 403);
  }

  const { error } = await admin.from('red_resenas').insert({
    id: `redresena-${uid()}`,
    perfil_id: perfilId,
    studio_id: sesion.studioId,
    solicitud_id: solicitud.id,
    autor: sesion.userId,
    puntuacion,
    comentario,
  });
  if (error) {
    if (error.code === '23505') return errorPeticion('Ya has dejado una reseña para esta profesional.', 409);
    return errorInterno('network:resenas:POST', error, 'No se ha podido enviar la reseña.');
  }

  return NextResponse.json({ ok: true });
}
