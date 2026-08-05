import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';

// El índice `instructores_email_unico_por_estudio` (migr 0125) impide dos fichas
// con el mismo email en un estudio. Cuando salta NO es un fallo del servidor: es
// la dueña intentando dar de alta a alguien que ya está. Pasarlo por
// `errorInterno` lo registraría como error y llenaría el log de rojo tapando los
// fallos de verdad — exactamente lo que ya pasó con los emails de demo.
// Se responde 409 con qué hacer, y no se registra nada.
const EMAIL_DUPLICADO = 'instructores_email_unico_por_estudio';
function esEmailDuplicado(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505' && (error.message ?? '').includes(EMAIL_DUPLICADO);
}
const MENSAJE_EMAIL_DUPLICADO =
  'Ya hay alguien en tu equipo con ese email. Si volvió después de una baja, reactiva su ficha en vez de crear otra: así conserva su historial.';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { congelarBajaCartera } from '@/lib/instructor-dependency';

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

const ROLES_VALIDOS = new Set(['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR']);

// Nada en este archivo (ni en permisos-reglas.ts, ni en RLS) impedía que un
// estudio se quedara sin NINGUNA propietaria activa: la propietaria puede
// editar y borrar cualquier ficha, incluida la suya, sin restricción — es
// justo lo que este endpoint le permite a propósito. Sin este guard, borrarse
// a sí misma o autodegradarse deja el estudio sin nadie que pueda reasignar
// roles ni gestionar la facturación (soporte tendría que arreglarlo a mano
// por service-role). `idExcluido` es la ficha que se está tocando: si al
// quitarla no queda ninguna otra propietaria ACTIVA, se bloquea.
async function quedariaSinPropietaria(
  admin: ReturnType<typeof getSupabaseAdmin>,
  studioId: string,
  idExcluido: string,
): Promise<boolean> {
  const { count } = await admin!
    .from('instructores')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('rol', 'PROPIETARIO')
    .eq('activo', true)
    .neq('id', idExcluido);
  return (count ?? 0) === 0;
}
const MENSAJE_ULTIMA_PROPIETARIA =
  'No puedes hacer esto: dejarías el estudio sin ninguna propietaria activa. Da de alta a otra propietaria antes.';

// Campos que la dueña puede fijar en cualquier ficha del estudio.
function saneaFieldsPropietario(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('nombre' in src) out.nombre = String(src.nombre ?? '').trim();
  if ('email' in src) out.email = src.email == null || src.email === '' ? null : String(src.email).trim();
  if ('telefono' in src) out.telefono = src.telefono == null || src.telefono === '' ? null : String(src.telefono).trim();
  if ('color' in src) out.color = String(src.color ?? '');
  if ('avatar' in src) out.avatar = src.avatar == null ? null : String(src.avatar);
  if ('fotoUrl' in src) out.foto_url = src.fotoUrl == null ? null : String(src.fotoUrl);
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
  if ('fotoUrl' in src) out.foto_url = src.fotoUrl == null ? null : String(src.fotoUrl);
  return out;
}

// ── Alta de instructora (solo PROPIETARIO) ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar el equipo' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const nombre = String(body?.nombre ?? '').trim();
  if (!id || !nombre) {
    return NextResponse.json({ error: 'Faltan datos obligatorios (id, nombre)' }, { status: 400 });
  }
  const rol = ROLES_VALIDOS.has(String(body?.rol)) ? String(body?.rol) : 'INSTRUCTOR';

  // Este endpoint usa service-role, que SE SALTA la RLS: la policy de la 0113 no
  // llega hasta aquí. Así que la regla de "solo hacia abajo" hay que aplicarla a
  // mano, o un manager se daría de alta una propietaria y habríamos hecho el
  // trabajo para nada.
  if (!rolesQuePuedeAsignar(sesion.rol).includes(rol as never)) {
    return NextResponse.json(
      { error: 'No puedes dar ese nivel de acceso. Pídeselo a la propietaria.' },
      { status: 403 },
    );
  }

  const email = body?.email == null || body?.email === '' ? null : String(body.email).trim();

  // P2-14: alta cross-sede — si esta persona YA tiene ficha activa en otra
  // sede de la MISMA cadena, se vincula su auth_user_id directo (ya tiene
  // cuenta, no hace falta self-claim). La búsqueda se acota SIEMPRE a
  // `cadena_id` — nunca abierta a toda la tabla `instructores`, sería una
  // vía de enumeración de emails entre estudios sin relación.
  let authUserIdVinculado: string | null = null;
  if (email) {
    const { data: estudio } = await admin.from('studios').select('cadena_id').eq('id', sesion.studioId).maybeSingle();
    const cadenaId = (estudio as { cadena_id: string | null } | null)?.cadena_id ?? null;
    if (cadenaId) {
      const { data: existente } = await admin
        .from('instructores')
        .select('auth_user_id, studios!inner(cadena_id)')
        .eq('email', email)
        .eq('activo', true)
        .not('auth_user_id', 'is', null)
        .eq('studios.cadena_id', cadenaId)
        .neq('studio_id', sesion.studioId)
        .limit(1)
        .maybeSingle();
      authUserIdVinculado = (existente as { auth_user_id: string | null } | null)?.auth_user_id ?? null;
    }
  }

  const row = {
    id,
    studio_id: sesion.studioId, // autoridad: el estudio del JWT, no el del body
    nombre,
    email,
    telefono: body?.telefono == null || body?.telefono === '' ? null : String(body.telefono).trim(),
    color: String(body?.color ?? '#F7A6C4'),
    activo: body?.activo == null ? true : Boolean(body.activo),
    avatar: body?.avatar == null ? null : String(body.avatar),
    foto_url: body?.fotoUrl == null ? null : String(body.fotoUrl),
    rol,
    // Si ya existe en otra sede de la cadena, se vincula directo (ya tiene
    // cuenta); si no, sigue el flujo normal de self-claim.
    auth_user_id: authUserIdVinculado,
  };
  const { error } = await admin.from('instructores').insert(row);
  if (esEmailDuplicado(error)) {
    return NextResponse.json({ error: MENSAJE_EMAIL_DUPLICADO }, { status: 409 });
  }
  if (error) return errorInterno('equipo:crear', error,
    'No se ha podido dar de alta a esta persona. Vuelve a intentarlo.');

  // El alta YA NO manda el email de invitación por su cuenta.
  //
  // Lo hacía: guardabas la ficha y salía el correo, sin preguntar y sin forma de
  // posponerlo. Una dueña que montó su estudio un domingo por la noche se libró
  // por poco de escribir a sus 18 instructoras a esa hora. Dar de alta a alguien
  // en tu sistema y avisarle son dos decisiones distintas, y la segunda es suya:
  // ahora se pide explícitamente por POST /api/equipo/invitar.
  //
  // `vinculada`: true si ya tenía ficha activa en otra sede de la cadena y se
  // conectó directo (sin self-claim) — la UI puede omitir la invitación.
  return NextResponse.json({ ok: true, vinculada: authUserIdVinculado !== null });
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
    .select('id, studio_id, auth_user_id, rol')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se pudo leer la ficha' }, { status: 500 });
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 });

  const esPropietario = sesion.rol === 'PROPIETARIO';
  const esPropia = ficha.auth_user_id === sesion.userId;
  // Un manager edita fichas de su equipo, pero NO la de la propietaria ni la de
  // otro manager: si no, bastaría con reescribir la ficha de la dueña.
  const puedeEditarEsaFicha =
    sesion.rol === 'MANAGER' && rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never);
  if (!esPropietario && !esPropia && !puedeEditarEsaFicha) {
    return NextResponse.json({ error: 'Solo puedes editar tu propia ficha' }, { status: 403 });
  }

  const update = (esPropietario || puedeEditarEsaFicha)
    ? saneaFieldsPropietario(changes)
    : saneaFieldsPropios(changes);
  // Y tampoco puede ascenderla al editarla.
  if (!esPropietario && 'rol' in update
      && !rolesQuePuedeAsignar(sesion.rol).includes(update.rol as never)) {
    return NextResponse.json(
      { error: 'No puedes dar ese nivel de acceso. Pídeselo a la propietaria.' },
      { status: 403 },
    );
  }
  if ('nombre' in update && !String(update.nombre).trim()) {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  // Solo puede dejar sin propietaria si ficha.rol YA era PROPIETARIO: cambiar
  // el rol de una RECEPCION nunca reduce el recuento de propietarias.
  const dejaDeSerPropietariaActiva = ficha.rol === 'PROPIETARIO'
    && ((update.rol !== undefined && update.rol !== 'PROPIETARIO') || update.activo === false);
  if (dejaDeSerPropietariaActiva && await quedariaSinPropietaria(admin, sesion.studioId, ficha.id)) {
    return NextResponse.json({ error: MENSAJE_ULTIMA_PROPIETARIA }, { status: 409 });
  }

  const { error } = await admin
    .from('instructores')
    .update(update)
    .eq('id', id)
    .eq('studio_id', sesion.studioId);
  if (esEmailDuplicado(error)) {
    return NextResponse.json({ error: MENSAJE_EMAIL_DUPLICADO }, { status: 409 });
  }
  if (error) return errorInterno('equipo:actualizar', error,
    'No se han podido guardar los cambios de esta persona. Vuelve a intentarlo.');
  return NextResponse.json({ ok: true });
}

// ── Baja de instructora (solo PROPIETARIO) ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para dar de baja a nadie' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  // Un manager no puede borrar a la propietaria ni a otro manager.
  const { data: victima } = await admin
    .from('instructores').select('rol, nombre').eq('id', id).eq('studio_id', sesion.studioId).maybeSingle();
  if (sesion.rol !== 'PROPIETARIO') {
    if (!victima || !rolesQuePuedeAsignar(sesion.rol).includes(victima.rol as never)) {
      return NextResponse.json({ error: 'No puedes dar de baja a esta persona.' }, { status: 403 });
    }
  }
  if (victima?.rol === 'PROPIETARIO' && await quedariaSinPropietaria(admin, sesion.studioId, id)) {
    return NextResponse.json({ error: MENSAJE_ULTIMA_PROPIETARIA }, { status: 409 });
  }

  // Fila 18: congelar la cartera ANTES del DELETE — `instructor_dependency_
  // snapshots.instructor_id` tiene ON DELETE CASCADE, así que tras el borrado
  // ya no habría nada que leer.
  if (victima?.nombre) {
    await congelarBajaCartera(admin, {
      studioId: sesion.studioId,
      instructorId: id,
      instructorNombre: victima.nombre,
    }).catch(e => console.error('[equipo:congelar-baja-cartera]', e));
  }

  const { error } = await admin
    .from('instructores')
    .delete()
    .eq('id', id)
    .eq('studio_id', sesion.studioId);
  if (error) return errorInterno('equipo:eliminar', error,
    'No se ha podido eliminar a esta persona. Si tiene clases asignadas, reasígnalas antes.');
  return NextResponse.json({ ok: true });
}
