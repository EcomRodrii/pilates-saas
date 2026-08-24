import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { emitirRedContactoSolicitado } from '@/lib/notifications/emit';

// Contacto — docs/NETWORK-IMPLEMENTATION-PLAN.md §6/§9.
//
// POST: un estudio contacta a una profesional (verificarSesionStaff, sin
// restringir a gerencia — igual que el buscador, abierto a cualquier rol de
// staff, incluida recepción). GET: la profesional ve las solicitudes que ha
// recibido (verificarUsuarioSupabase, igual que el resto de Fase 2+).

export interface FilaSolicitudRecibida {
  id: string;
  studioId: string;
  estudioNombre: string;
  estudioCiudad: string | null;
  mensaje: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  creadoEn: string;
  resueltoEn: string | null;
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { perfilId?: unknown; mensaje?: unknown } | null;
  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  if (!perfilId) return errorPeticion('Falta el perfil.');
  const mensaje = body?.mensaje == null || body.mensaje === '' ? null : String(body.mensaje).trim();

  const { data: perfil } = await admin
    .from('red_perfiles').select('id, auth_user_id, nombre').eq('id', perfilId).eq('estado', 'published').maybeSingle();
  if (!perfil) return errorPeticion('Este perfil ya no está disponible.', 404);

  const { data: solicitud, error } = await admin
    .from('red_solicitudes_contacto')
    .insert({ id: `redcontacto-${uid()}`, perfil_id: perfilId, studio_id: sesion.studioId, solicitado_por: sesion.userId, mensaje })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return errorPeticion('Ya tienes una solicitud pendiente con esta profesional.', 409);
    return errorInterno('network:contacto:POST', error, 'No se ha podido enviar la solicitud.');
  }

  // `sesion.nombre` es "instructora → su nombre; propietaria → nombre del
  // estudio" (lib/auth-server.ts) — este endpoint es de cualquier rol de
  // staff, no solo propietaria, así que hay que leer el nombre del ESTUDIO
  // aparte en vez de asumir que sesion.nombre ya lo es.
  const { data: estudio } = await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle();

  await emitirRedContactoSolicitado(admin, {
    studioId: sesion.studioId, authUserId: perfil.auth_user_id as string,
    solicitudId: solicitud.id as string, estudioNombre: estudio?.nombre ?? sesion.nombre,
  });

  // F1: el estudio necesita el id para poder abrir el chat pre-match
  // (app/(dashboard)/network/[perfilId]) sin recargar la página.
  return NextResponse.json({ ok: true, solicitudId: solicitud.id as string });
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Lado estudio (F1): ¿ya hay una solicitud (de cualquier estado) de mi
  // estudio con este perfil concreto? Sirve para que la ficha de la
  // candidata sepa si debe ofrecer "Contactar" o abrir el chat ya
  // existente. Distinto del resto de este GET (que es del lado instructora,
  // sin perfilId) — se distingue por el query param, nunca por el tipo de
  // sesión a ciegas.
  const perfilIdParam = req.nextUrl.searchParams.get('perfilId');
  if (perfilIdParam) {
    const sesion = await verificarSesionStaff(req);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { data, error } = await admin
      .from('red_solicitudes_contacto')
      .select('id, estado')
      .eq('studio_id', sesion.studioId).eq('perfil_id', perfilIdParam)
      .order('creado_en', { ascending: false }).limit(1).maybeSingle();
    if (error) return errorInterno('network:contacto:GET:perfil', error, 'No se ha podido comprobar la solicitud.');
    return NextResponse.json({ solicitud: data ? { id: data.id, estado: data.estado } : null });
  }

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: perfil } = await admin.from('red_perfiles').select('id').eq('auth_user_id', usuario.userId).maybeSingle();
  if (!perfil) return NextResponse.json({ solicitudes: [] });

  const { data, error } = await admin
    .from('red_solicitudes_contacto')
    .select('id, studio_id, mensaje, estado, creado_en, resuelto_en, studios ( nombre, ciudad )')
    .eq('perfil_id', perfil.id)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:contacto:GET', error, 'No se han podido cargar tus solicitudes.');

  type FilaCruda = {
    id: string; studio_id: string; mensaje: string | null; estado: string; creado_en: string; resuelto_en: string | null;
    studios: { nombre: string | null; ciudad: string | null } | null;
  };
  const filas: FilaSolicitudRecibida[] = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    studioId: f.studio_id,
    estudioNombre: f.studios?.nombre ?? 'Un estudio',
    estudioCiudad: f.studios?.ciudad ?? null,
    mensaje: f.mensaje,
    estado: f.estado as FilaSolicitudRecibida['estado'],
    creadoEn: f.creado_en,
    resueltoEn: f.resuelto_en,
  }));

  return NextResponse.json({ solicitudes: filas });
}
