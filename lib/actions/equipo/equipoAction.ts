'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { leerSnapshotParaBaja, registrarBajaCartera } from '@/lib/instructor-dependency';
import { obtenerOFirmarEnlace, marcarEnlaceEnviadoPorEmail } from '@/lib/sustituciones/enlaces';
import { enviarEmailSolicitudDisponibilidad } from '@/lib/emails/solicitud-disponibilidad-server';
import * as Sentry from '@sentry/nextjs';
import { ErrorAccion } from '@/lib/actions/errores';

/**
 * equipoAction
 * Migrated from: app/api/equipo/route.ts
 * HTTP Methods: POST (crear), PATCH (editar), DELETE (baja)
 */

const EMAIL_DUPLICADO = 'instructores_email_unico_por_estudio';
function esEmailDuplicado(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505' && (error.message ?? '').includes(EMAIL_DUPLICADO);
}

const ROLES_VALIDOS = new Set(['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR']);

async function quedariaSinPropietaria(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
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

// `bio` es la bio pública que pinta la ficha de instructora del portal
// (app/portal/[slug]/instructores/[instructorId]/page.tsx:148). El formulario
// de Equipo la edita y la envía desde siempre, pero ninguna de las dos listas
// blancas la copiaba: la pantalla decía "Cambios guardados" y la columna
// `instructores.bio` nunca se escribía. El límite de 400 es el mismo que
// muestra el contador del formulario — la validación de cliente no puede ser
// la única.
function saneaBio(src: Record<string, unknown>): string | null {
  const v = src.bio;
  if (v == null || v === '') return null;
  return String(v).trim().slice(0, 400) || null;
}

function saneaFieldsPropietario(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('bio' in src) out.bio = saneaBio(src);
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

function saneaFieldsPropios(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('bio' in src) out.bio = saneaBio(src);
  if ('nombre' in src) out.nombre = String(src.nombre ?? '').trim();
  if ('email' in src) out.email = src.email == null || src.email === '' ? null : String(src.email).trim();
  if ('telefono' in src) out.telefono = src.telefono == null || src.telefono === '' ? null : String(src.telefono).trim();
  if ('color' in src) out.color = String(src.color ?? '');
  if ('avatar' in src) out.avatar = src.avatar == null ? null : String(src.avatar);
  if ('fotoUrl' in src) out.foto_url = src.fotoUrl == null ? null : String(src.fotoUrl);
  return out;
}

async function crearInstructora(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: Record<string, unknown>,
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  const nombre = String(body?.nombre ?? '').trim();
  if (!id || !nombre) throw new ErrorAccion('Faltan datos obligatorios (id, nombre)', 400);

  const rol = ROLES_VALIDOS.has(String(body?.rol)) ? String(body?.rol) : 'INSTRUCTOR';
  if (!rolesQuePuedeAsignar(sesion.rol).includes(rol as never)) {
    throw new ErrorAccion('No puedes dar ese nivel de acceso. Pídeselo a la propietaria.', 403);
  }

  const email = body?.email == null || body?.email === '' ? null : String(body.email).trim();

  type EstudioAlta = { cadena_id: string | null; nombre: string | null; color_primario: string | null; logo_url: string | null };
  let authUserIdVinculado: string | null = null;
  let estudio: EstudioAlta | null = null;

  if (email) {
    const { data } = await admin.from('studios')
      .select('cadena_id, nombre, color_primario, logo_url').eq('id', sesion.studioId).maybeSingle();
    estudio = data as EstudioAlta | null;
    const cadenaId = estudio?.cadena_id ?? null;
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
    studio_id: sesion.studioId,
    nombre,
    email,
    telefono: body?.telefono == null || body?.telefono === '' ? null : String(body.telefono).trim(),
    color: String(body?.color ?? '#F7A6C4'),
    activo: body?.activo == null ? true : Boolean(body.activo),
    avatar: body?.avatar == null ? null : String(body.avatar),
    foto_url: body?.fotoUrl == null ? null : String(body.fotoUrl),
    // Mismo motivo que en las dos listas blancas de arriba: el alta también
    // envía `bio` desde el formulario de Equipo.
    bio: saneaBio(body),
    rol,
    auth_user_id: authUserIdVinculado,
  };

  const { error } = await admin.from('instructores').insert(row);
  if (esEmailDuplicado(error)) {
    throw new ErrorAccion('Ya hay alguien en tu equipo con ese email. Si volvió después de una baja, reactiva su ficha en vez de crear otra: así conserva su historial.', 409);
  }
  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'crear' } });
    throw new ErrorAccion('No se ha podido guardar el miembro del equipo.', 500);
  }

  if (email && rol === 'INSTRUCTOR') {
    try {
      const token = await obtenerOFirmarEnlace(admin, sesion.studioId, id, 'disponibilidad');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
      const r = await enviarEmailSolicitudDisponibilidad({
        to: email,
        nombre,
        propietariaNombre: sesion.nombre,
        estudioNombre: estudio?.nombre ?? 'tu estudio',
        colorPrimario: estudio?.color_primario,
        logoUrl: estudio?.logo_url,
        url: `${appUrl}/disponibilidad/${token}`,
      });
      if (r.ok) await marcarEnlaceEnviadoPorEmail(admin, id, 'disponibilidad');
    } catch (e) {
      Sentry.captureException(e);
    }
  }

  return { ok: true, vinculada: authUserIdVinculado !== null };
}

async function editarInstructora(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: { id?: unknown; changes?: unknown },
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  const changes = (body?.changes ?? {}) as Record<string, unknown>;
  if (!id) throw new ErrorAccion('Falta el id', 400);

  const { data: ficha } = await admin
    .from('instructores')
    .select('id, studio_id, auth_user_id, rol, nombre, activo')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!ficha) throw new ErrorAccion('Ficha no encontrada', 404);

  const esPropietario = sesion.rol === 'PROPIETARIO';
  const esPropia = ficha.auth_user_id === sesion.userId;
  const puedeEditarEsaFicha =
    sesion.rol === 'MANAGER' && rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never);

  if (!esPropietario && !esPropia && !puedeEditarEsaFicha) {
    throw new ErrorAccion('Solo puedes editar tu propia ficha', 403);
  }

  const update = (esPropietario || puedeEditarEsaFicha)
    ? saneaFieldsPropietario(changes)
    : saneaFieldsPropios(changes);

  if (!esPropietario && 'rol' in update
      && !rolesQuePuedeAsignar(sesion.rol).includes(update.rol as never)) {
    throw new ErrorAccion('No puedes dar ese nivel de acceso. Pídeselo a la propietaria.', 403);
  }

  if ('nombre' in update && !String(update.nombre).trim()) {
    throw new ErrorAccion('El nombre no puede quedar vacío', 400);
  }

  if (Object.keys(update).length === 0) {
    throw new ErrorAccion('Nada que actualizar', 400);
  }

  const dejaDeSerPropietariaActiva = ficha.rol === 'PROPIETARIO'
    && ((update.rol !== undefined && update.rol !== 'PROPIETARIO') || update.activo === false);
  if (dejaDeSerPropietariaActiva && await quedariaSinPropietaria(admin, sesion.studioId, ficha.id)) {
    throw new ErrorAccion('No puedes hacer esto: dejarías el estudio sin ninguna propietaria activa. Da de alta a otra propietaria antes.', 409);
  }

  const pasaAInactiva = ficha.activo === true && update.activo === false;

  const { error } = await admin
    .from('instructores')
    .update(update)
    .eq('id', id)
    .eq('studio_id', sesion.studioId);

  if (esEmailDuplicado(error)) {
    throw new ErrorAccion('Ya hay alguien en tu equipo con ese email.', 409);
  }
  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'editar' } });
    throw new ErrorAccion('No se ha podido guardar la ficha.', 500);
  }

  if (pasaAInactiva && ficha.nombre) {
    const snapshotBaja = await leerSnapshotParaBaja(admin, sesion.studioId, id).catch(() => null);
    if (snapshotBaja) {
      await registrarBajaCartera(admin, {
        studioId: sesion.studioId,
        instructorId: id,
        instructorNombre: ficha.nombre,
        snapshot: snapshotBaja,
      }).catch(e => { Sentry.captureException(e); });
    }
  }

  return { ok: true };
}

async function bajaInstructora(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: { id?: unknown },
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) throw new ErrorAccion('Falta el id', 400);

  const { data: victima } = await admin
    .from('instructores').select('rol, nombre').eq('id', id).eq('studio_id', sesion.studioId).maybeSingle();

  if (sesion.rol !== 'PROPIETARIO') {
    if (!victima || !rolesQuePuedeAsignar(sesion.rol).includes(victima.rol as never)) {
      throw new ErrorAccion('No puedes dar de baja a esta persona.', 403);
    }
  }

  if (victima?.rol === 'PROPIETARIO' && await quedariaSinPropietaria(admin, sesion.studioId, id)) {
    throw new ErrorAccion('No puedes hacer esto: dejarías el estudio sin ninguna propietaria activa.', 409);
  }

  const snapshotBaja = victima?.nombre
    ? await leerSnapshotParaBaja(admin, sesion.studioId, id).catch(() => null)
    : null;

  // Auditoría de producto (P0-5): esto era un DELETE duro, pero el modal de
  // confirmación (app/(dashboard)/equipo/page.tsx) promete "las clases y citas
  // ya asignadas no se borran". `sesiones_instructor_id_fkey` es NO ACTION (no
  // SET NULL) — el DELETE fallaba con 23503 en cuanto la instructora tenía una
  // sola clase asignada, contradiciendo esa promesa. `activo` ya es el flag de
  // baja que usa el resto del producto (PATCH lo reactiva, los listados de
  // equipo/candidatas ya filtran por él) — dar de baja es solo desactivar.
  const { error } = await admin.from('instructores')
    .update({ activo: false }).eq('id', id).eq('studio_id', sesion.studioId);
  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'baja' } });
    throw new ErrorAccion('No se ha podido dar de baja.', 500);
  }

  if (snapshotBaja && victima?.nombre) {
    await registrarBajaCartera(admin, {
      studioId: sesion.studioId,
      instructorId: id,
      instructorNombre: victima.nombre,
      snapshot: snapshotBaja,
    }).catch(e => { Sentry.captureException(e); });
  }

  return { ok: true };
}

export async function equipoAction(input: {
  method?: string;
  id?: string;
  changes?: Record<string, unknown>;
  [key: string]: unknown;
}) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();

  if (!admin) throw new ErrorAccion('Servidor no configurado', 503);

  const method = (input.method || 'POST').toUpperCase();

  if (method === 'POST') {
    if (!puedeGestionarEquipo(sesion.rol)) {
      throw new ErrorAccion('No tienes permiso para gestionar el equipo', 403);
    }
    return await crearInstructora(admin, sesion, input);
  }

  if (method === 'PATCH') {
    return await editarInstructora(admin, sesion, input as { id?: unknown; changes?: unknown });
  }

  if (method === 'DELETE') {
    if (!puedeGestionarEquipo(sesion.rol)) {
      throw new ErrorAccion('No tienes permiso para dar de baja a nadie', 403);
    }
    return await bajaInstructora(admin, sesion, input as { id?: unknown });
  }

  throw new ErrorAccion(`Método ${method} no soportado`, 405);
}
