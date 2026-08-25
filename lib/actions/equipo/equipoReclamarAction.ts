'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { supabase } from '@/lib/db/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enviarEmailAccesoActivado } from '@/lib/emails/acceso-activado-server';
import { MENSAJE_RECHAZO, motivoNoReclamable } from '@/lib/equipo/reclamar-reglas';
import type { Rol } from '@/lib/types';

/**
 * equipoReclamarAction
 * Migrated from: app/api/equipo/reclamar/route.ts
 * Vincula cuenta recién creada con su ficha de equipo
 */

const ROLES: readonly string[] = ['PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER'];
const ERROR_SISTEMA = 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.';
const ENLACE_NO_VALIDO = 'Este enlace ya no vale. Pídele a tu estudio que te lo envíe de nuevo.';

async function avisarAlEstudio(admin: ReturnType<typeof getSupabaseAdmin>, studioId: string, nombreFicha: string, emailCuenta: string | null) {
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
  if (!token) throw new Error(ENLACE_NO_VALIDO);

  const claim = verificarTokenInstructora(token, 'invitacion');
  if (!claim) throw new Error(ENLACE_NO_VALIDO);

  // Get user from JWT (passed from client)
  const jwt = typeof input?.jwt === 'string' ? input.jwt : null;
  if (!jwt) throw new Error('No autorizado');

  const { data: { user }, error: errAuth } = await supabase.auth.getUser(jwt);
  if (errAuth || !user) throw new Error('No autorizado');

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error(ERROR_SISTEMA);

  const rolEmisor = ROLES.includes(claim.ref as Rol) ? (claim.ref as Rol) : null;

  const { data: ficha, error } = await admin
    .from('instructores')
    .select('id, nombre, rol, activo, auth_user_id, studio_id')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();

  if (error) throw new Error(ERROR_SISTEMA);
  if (!ficha) throw new Error(MENSAJE_RECHAZO.FICHA_INACTIVA);

  const motivo = motivoNoReclamable(
    { rol: ficha.rol as Rol, activo: ficha.activo as boolean | null, authUserId: ficha.auth_user_id },
    user.id,
    rolEmisor,
  );

  if (motivo) {
    console.warn('[equipo:reclamar] rechazo', motivo, 'ficha', ficha.id, 'rol', ficha.rol, 'emisor', rolEmisor);
    throw new Error(MENSAJE_RECHAZO[motivo]);
  }

  const { data: tocadas, error: errUpdate } = await admin
    .from('instructores')
    .update({ auth_user_id: user.id })
    .eq('id', ficha.id)
    .is('auth_user_id', null)
    .select('id');

  if (errUpdate) throw new Error(ERROR_SISTEMA);

  const nueva = (tocadas?.length ?? 0) > 0;
  if (nueva) {
    await avisarAlEstudio(admin, ficha.studio_id as string, ficha.nombre as string, user.email ?? null);
  }

  return { vinculadas: nueva ? 1 : 0, estudioId: ficha.studio_id };
}
