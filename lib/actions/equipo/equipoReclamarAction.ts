'use server';

<<<<<<< HEAD
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { supabase } from '@/lib/db/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
=======
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { supabase } from '@/lib/db/supabase';
>>>>>>> origin/main
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enviarEmailAccesoActivado } from '@/lib/emails/acceso-activado-server';
import { MENSAJE_RECHAZO, motivoNoReclamable } from '@/lib/equipo/reclamar-reglas';
import type { Rol } from '@/lib/types';
import { ErrorAccion } from '@/lib/actions/errores';
import * as Sentry from '@sentry/nextjs';

/**
 * equipoReclamarAction
 * Migrated from: app/api/equipo/reclamar/route.ts
 * Vincula cuenta recién creada con su ficha de equipo
 */

const ROLES: readonly string[] = ['PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER'];
const ERROR_SISTEMA = 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.';
const ENLACE_NO_VALIDO = 'Este enlace ya no vale. Pídele a tu estudio que te lo envíe de nuevo.';

<<<<<<< HEAD
async function avisarAlEstudio(admin: ReturnType<typeof getSupabaseAdmin>, studioId: string, nombreFicha: string, emailCuenta: string | null) {
=======
async function avisarAlEstudio(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string, nombreFicha: string, emailCuenta: string | null) {
>>>>>>> origin/main
  try {
    const { data: studio } = await admin
      .from('studios')
      .select('nombre, email, color_primario, logo_url')
      .eq('id', studioId)
      .maybeSingle();
    if (!studio?.email) return;
    await enviarEmailAccesoActivado({
      to: studio.email as string,
      nombre: nombreFicha,
      emailCuenta,
      estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
      colorPrimario: studio.color_primario as string | null,
      logoUrl: studio.logo_url as string | null,
    });
  } catch (e) {
    console.error('[equipo:reclamar] aviso al estudio', e);
  }
}

export async function equipoReclamarAction(input: { token?: string; jwt?: string }) {
  const token = typeof input?.token === 'string' ? input.token : null;
  if (!token) throw new ErrorAccion(ENLACE_NO_VALIDO, 400);

  const claim = verificarTokenInstructora(token, 'invitacion');
  if (!claim) throw new ErrorAccion(ENLACE_NO_VALIDO, 400);

  // Get user from JWT (passed from client)
  const jwt = typeof input?.jwt === 'string' ? input.jwt : null;
  if (!jwt) throw new ErrorAccion('No autorizado', 401);

  const { data: { user }, error: errAuth } = await supabase.auth.getUser(jwt);
  if (errAuth || !user) throw new ErrorAccion('No autorizado', 401);

  const admin = getSupabaseAdmin();
  if (!admin) throw new ErrorAccion(ERROR_SISTEMA, 503);

  const rolEmisor = ROLES.includes(claim.ref as Rol) ? (claim.ref as Rol) : null;

  const { data: ficha, error } = await admin
    .from('instructores')
    .select('id, nombre, rol, activo, auth_user_id, studio_id')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'reclamar' } });
    throw new ErrorAccion(ERROR_SISTEMA, 500);
  }
  if (!ficha) throw new ErrorAccion(MENSAJE_RECHAZO.FICHA_INACTIVA, 404);

  const motivo = motivoNoReclamable(
    { rol: ficha.rol as Rol, activo: ficha.activo as boolean | null, authUserId: ficha.auth_user_id },
    user.id,
    rolEmisor,
  );

  if (motivo) {
    console.warn('[equipo:reclamar] rechazo', motivo, 'ficha', ficha.id, 'rol', ficha.rol, 'emisor', rolEmisor);
    // FICHA_INACTIVA es la única de las cuatro que significa "esto ya no
    // existe" (404); las otras tres son un conflicto con el estado actual de
    // la ficha (ya vinculada, rol que no le toca activar) — 409. Antes el
    // route.ts intentaba adivinar el status por subcadenas del mensaje y
    // ninguno de los 4 textos reales de MENSAJE_RECHAZO casaba, así que los
    // cuatro caían en el 500 por defecto.
    throw new ErrorAccion(MENSAJE_RECHAZO[motivo], motivo === 'FICHA_INACTIVA' ? 404 : 409);
  }

  const { data: tocadas, error: errUpdate } = await admin
    .from('instructores')
    .update({ auth_user_id: user.id })
    .eq('id', ficha.id)
    .is('auth_user_id', null)
    .select('id');

  if (errUpdate) {
    Sentry.captureException(errUpdate, { tags: { area: 'equipo', accion: 'reclamar' } });
    throw new ErrorAccion(ERROR_SISTEMA, 500);
  }

  const nueva = (tocadas?.length ?? 0) > 0;
  if (nueva) {
    await avisarAlEstudio(admin, ficha.studio_id as string, ficha.nombre as string, user.email ?? null);
  }

  return { vinculadas: nueva ? 1 : 0, estudioId: ficha.studio_id };
}
