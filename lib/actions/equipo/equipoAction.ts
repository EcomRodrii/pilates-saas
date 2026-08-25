'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { leerSnapshotParaBaja, registrarBajaCartera } from '@/lib/instructor-dependency';
import { obtenerOFirmarEnlace, marcarEnlaceEnviadoPorEmail } from '@/lib/sustituciones/enlaces';
import { enviarEmailSolicitudDisponibilidad } from '@/lib/emails/solicitud-disponibilidad-server';
import * as Sentry from '@sentry/nextjs';

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
<<<<<<< HEAD
  admin: ReturnType<typeof getSupabaseAdmin>,
=======
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
>>>>>>> origin/main
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

async function crearInstructora(
<<<<<<< HEAD
  admin: ReturnType<typeof getSupabaseAdmin>,
=======
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
>>>>>>> origin/main
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: Record<string, unknown>,
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  const nombre = String(body?.nombre ?? '').trim();
  if (!id || !nombre) throw new Error('Faltan datos obligatorios (id, nombre)');

  const rol = ROLES_VALIDOS.has(String(body?.rol)) ? String(body?.rol) : 'INSTRUCTOR';
  if (!rolesQuePuedeAsignar(sesion.rol).includes(rol as never)) {
    throw new Error('No puedes dar ese nivel de acceso. Pídeselo a la propietaria.');
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
    rol,
    auth_user_id: authUserIdVinculado,
  };

  const { error } = await admin.from('instructores').insert(row);
  if (esEmailDuplicado(error)) {
    throw new Error('Ya hay alguien en tu equipo con ese email. Si volvió después de una baja, reactiva su ficha en vez de crear otra: así conserva su historial.');
  }
  if (error) throw error;

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
<<<<<<< HEAD
  admin: ReturnType<typeof getSupabaseAdmin>,
=======
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
>>>>>>> origin/main
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: { id?: unknown; changes?: unknown },
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  const changes = (body?.changes ?? {}) as Record<string, unknown>;
  if (!id) throw new Error('Falta el id');

  const { data: ficha } = await admin
    .from('instructores')
    .select('id, studio_id, auth_user_id, rol, nombre, activo')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!ficha) throw new Error('Ficha no encontrada');

  const esPropietario = sesion.rol === 'PROPIETARIO';
  const esPropia = ficha.auth_user_id === sesion.userId;
  const puedeEditarEsaFicha =
    sesion.rol === 'MANAGER' && rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never);

  if (!esPropietario && !esPropia && !puedeEditarEsaFicha) {
    throw new Error('Solo puedes editar tu propia ficha');
  }

  const update = (esPropietario || puedeEditarEsaFicha)
    ? saneaFieldsPropietario(changes)
    : saneaFieldsPropios(changes);

  if (!esPropietario && 'rol' in update
      && !rolesQuePuedeAsignar(sesion.rol).includes(update.rol as never)) {
    throw new Error('No puedes dar ese nivel de acceso. Pídeselo a la propietaria.');
  }

  if ('nombre' in update && !String(update.nombre).trim()) {
    throw new Error('El nombre no puede quedar vacío');
  }

  if (Object.keys(update).length === 0) {
    throw new Error('Nada que actualizar');
  }

  const dejaDeSerPropietariaActiva = ficha.rol === 'PROPIETARIO'
    && ((update.rol !== undefined && update.rol !== 'PROPIETARIO') || update.activo === false);
  if (dejaDeSerPropietariaActiva && await quedariaSinPropietaria(admin, sesion.studioId, ficha.id)) {
    throw new Error('No puedes hacer esto: dejarías el estudio sin ninguna propietaria activa. Da de alta a otra propietaria antes.');
  }

  const pasaAInactiva = ficha.activo === true && update.activo === false;

  const { error } = await admin
    .from('instructores')
    .update(update)
    .eq('id', id)
    .eq('studio_id', sesion.studioId);

  if (esEmailDuplicado(error)) {
    throw new Error('Ya hay alguien en tu equipo con ese email.');
  }
  if (error) throw error;

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
<<<<<<< HEAD
  admin: ReturnType<typeof getSupabaseAdmin>,
=======
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
>>>>>>> origin/main
  sesion: Awaited<ReturnType<typeof requireAuthInServerAction>>,
  body: { id?: unknown },
) {
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) throw new Error('Falta el id');

  const { data: victima } = await admin
    .from('instructores').select('rol, nombre').eq('id', id).eq('studio_id', sesion.studioId).maybeSingle();

  if (sesion.rol !== 'PROPIETARIO') {
    if (!victima || !rolesQuePuedeAsignar(sesion.rol).includes(victima.rol as never)) {
      throw new Error('No puedes dar de baja a esta persona.');
    }
  }

  if (victima?.rol === 'PROPIETARIO' && await quedariaSinPropietaria(admin, sesion.studioId, id)) {
    throw new Error('No puedes hacer esto: dejarías el estudio sin ninguna propietaria activa.');
  }

  const snapshotBaja = victima?.nombre
    ? await leerSnapshotParaBaja(admin, sesion.studioId, id).catch(() => null)
    : null;

  const { error } = await admin.from('instructores').delete().eq('id', id).eq('studio_id', sesion.studioId);
  if (error) throw error;

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

  if (!admin) throw new Error('Servidor no configurado');

  const method = (input.method || 'POST').toUpperCase();

  if (method === 'POST') {
    if (!puedeGestionarEquipo(sesion.rol)) {
      throw new Error('No tienes permiso para gestionar el equipo');
    }
    return await crearInstructora(admin, sesion, input);
  }

  if (method === 'PATCH') {
<<<<<<< HEAD
    return await editarInstructora(admin, sesion, input as any);
=======
    return await editarInstructora(admin, sesion, input as { id?: unknown; changes?: unknown });
>>>>>>> origin/main
  }

  if (method === 'DELETE') {
    if (!puedeGestionarEquipo(sesion.rol)) {
      throw new Error('No tienes permiso para dar de baja a nadie');
    }
<<<<<<< HEAD
    return await bajaInstructora(admin, sesion, input as any);
=======
    return await bajaInstructora(admin, sesion, input as { id?: unknown });
>>>>>>> origin/main
  }

  throw new Error(`Método ${method} no soportado`);
}
