import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';

// Reseñas — brief §25/§9. Solo puede reseñar un estudio con una solicitud de
// contacto ACEPTADA con ese perfil (docs/NETWORK-AUDIT-2.md, misma "relación
// profesional validada" que ya existe en el modelo, no un sistema nuevo).
// Una por relación (unique studio_id+perfil_id en la tabla) — reseñar de
// nuevo simplemente falla con 409, no hay edición en esta ronda.
//
// GET: elegibilidad — antes de pintar el formulario, el panel pregunta si
// esta combinación estudio+perfil puede reseñar (sí ya reseñó, no vuelve a
// mostrar el formulario).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = req.nextUrl.searchParams.get('perfilId');
  if (!perfilId) return errorPeticion('Falta el perfil.');

  const [{ data: solicitudAceptada }, { data: resenaExistente }] = await Promise.all([
    admin.from('red_solicitudes_contacto').select('id')
      .eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).eq('estado', 'aceptada')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    admin.from('red_resenas').select('id').eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).maybeSingle(),
  ]);

  return NextResponse.json({
    elegible: Boolean(solicitudAceptada) && !resenaExistente,
    yaResenado: Boolean(resenaExistente),
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

  const { data: solicitud } = await admin
    .from('red_solicitudes_contacto').select('id')
    .eq('perfil_id', perfilId).eq('studio_id', sesion.studioId).eq('estado', 'aceptada')
    .order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (!solicitud) return errorPeticion('Solo puedes reseñar a una profesional con la que hayas tenido contacto aceptado.', 403);

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
