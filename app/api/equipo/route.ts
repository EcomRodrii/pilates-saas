import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// A-2: gestión del equipo (alta/edición/baja de instructoras y su ROL) con
// enforcement de servidor. Antes el cliente escribía `rol` —incluido PROPIETARIO—
// directamente a `instructores` con el cliente anónimo autenticado; la única
// barrera era la RLS y la UI (que además caía a PROPIETARIO por defecto). Ahora:
//   · Crear / borrar / cambiar rol / activar-desactivar → SOLO PROPIETARIO.
//   · Cualquier staff puede autoeditar SU PROPIA ficha (nombre/email/teléfono),
//     nunca su rol ni su estado. Esto además arregla un bug latente: con la RLS
//     actual esa autoedición de RECEPCIÓN/INSTRUCTOR fallaba en silencio.
// El studio_id es SIEMPRE el del JWT (nunca el del body) y toda operación se
// scopea a ese estudio, así que una dueña no puede tocar el equipo de otro.

const ROLES_VALIDOS = new Set(['PROPIETARIO', 'RECEPCION', 'INSTRUCTOR']);

// Campos que la dueña puede fijar en cualquier ficha del estudio.
function saneaFieldsPropietario(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('nombre' in src) out.nombre = String(src.nombre ?? '').trim();
  if ('email' in src) out.email = src.email == null || src.email === '' ? null : String(src.email).trim();
  if ('telefono' in src) out.telefono = src.telefono == null || src.telefono === '' ? null : String(src.telefono).trim();
  if ('color' in src) out.color = String(src.color ?? '');
  if ('avatar' in src) out.avatar = src.avatar == null ? null : String(src.avatar);
  if ('activo' in src) out.activo = Boolean(src.activo);
  if ('rol' in src && ROLES_VALIDOS.has(String(src.rol))) out.rol = String(src.rol);
  return out;
}

// Campos que un staff puede cambiar de SU PROPIA ficha (nunca rol ni activo).
function saneaFieldsPropios(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('nombre' in src) out.nombre = String(src.nombre ?? '').trim();
  if ('email' in src) out.email = src.email == null || src.email === '' ? null : String(src.email).trim();
  if ('telefono' in src) out.telefono = src.telefono == null || src.telefono === '' ? null : String(src.telefono).trim();
  if ('color' in src) out.color = String(src.color ?? '');
  if ('avatar' in src) out.avatar = src.avatar == null ? null : String(src.avatar);
  return out;
}

// ── Alta de instructora (solo PROPIETARIO) ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede gestionar el equipo' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const nombre = String(body?.nombre ?? '').trim();
  if (!id || !nombre) {
    return NextResponse.json({ error: 'Faltan datos obligatorios (id, nombre)' }, { status: 400 });
  }
  const rol = ROLES_VALIDOS.has(String(body?.rol)) ? String(body?.rol) : 'INSTRUCTOR';

  const row = {
    id,
    studio_id: sesion.studioId, // autoridad: el estudio del JWT, no el del body
    nombre,
    email: body?.email == null || body?.email === '' ? null : String(body.email).trim(),
    telefono: body?.telefono == null || body?.telefono === '' ? null : String(body.telefono).trim(),
    color: String(body?.color ?? '#F7A6C4'),
    activo: body?.activo == null ? true : Boolean(body.activo),
    avatar: body?.avatar == null ? null : String(body.avatar),
    rol,
    auth_user_id: null, // el vínculo se hace vía self-claim (la persona reclama su ficha)
  };
  const { error } = await admin.from('instructores').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Edición (PROPIETARIO cualquier ficha; el resto solo la suya) ─────────────────
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; changes?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const changes = (body?.changes ?? {}) as Record<string, unknown>;
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  // La ficha a editar debe existir y pertenecer al estudio de la sesión.
  const { data: ficha, error: errLeer } = await admin
    .from('instructores')
    .select('id, studio_id, auth_user_id')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se pudo leer la ficha' }, { status: 500 });
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 });

  const esPropietario = sesion.rol === 'PROPIETARIO';
  const esPropia = ficha.auth_user_id === sesion.userId;
  if (!esPropietario && !esPropia) {
    return NextResponse.json({ error: 'Solo puedes editar tu propia ficha' }, { status: 403 });
  }

  const update = esPropietario ? saneaFieldsPropietario(changes) : saneaFieldsPropios(changes);
  if ('nombre' in update && !String(update.nombre).trim()) {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { error } = await admin
    .from('instructores')
    .update(update)
    .eq('id', id)
    .eq('studio_id', sesion.studioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Baja de instructora (solo PROPIETARIO) ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede eliminar miembros' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const { error } = await admin
    .from('instructores')
    .delete()
    .eq('id', id)
    .eq('studio_id', sesion.studioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
