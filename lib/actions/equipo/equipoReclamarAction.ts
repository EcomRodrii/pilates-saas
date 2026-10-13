'use server';

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { supabase } from '@/lib/db/supabase';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado, gastarInvitacion } from '@/lib/sustituciones/enlaces';
import { avisarAlEstudioAccesoActivado } from '@/lib/equipo/avisar-acceso-activado';
import { conservarEstudioDelPanel } from '@/lib/equipo/conservar-estudio-panel';
import { MENSAJE_RECHAZO, estadoHttpDelRechazo, motivoNoReclamable, rolDelEnlace } from '@/lib/equipo/reclamar-reglas';
import type { Rol } from '@/lib/types';
import { ErrorAccion } from '@/lib/actions/errores';
import * as Sentry from '@sentry/nextjs';
import { pasoDeLaSesion } from '@/lib/auth-server';

/**
 * equipoReclamarAction
 * Migrated from: app/api/equipo/reclamar/route.ts
 * Vincula cuenta recién creada con su ficha de equipo
 */

const ERROR_SISTEMA = 'No hemos podido activar tu acceso. Inténtalo de nuevo en unos segundos.';
const ENLACE_NO_VALIDO = 'Este enlace ya no vale. Pídele a tu estudio que te lo envíe de nuevo.';
const OTRO_ACCESO = 'Tu cuenta ya tiene otro acceso en este estudio. Pídele al estudio que lo revise.';

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
  // Con la verificación en dos pasos activada, primero el segundo paso.
  if (await pasoDeLaSesion(jwt, user) !== 'ok') throw new ErrorAccion('Escribe primero el código de la verificación en dos pasos.', 401);

  const admin = getSupabaseAdmin();
  if (!admin) throw new ErrorAccion(ERROR_SISTEMA, 503);

  const { data: ficha, error } = await admin
    .from('instructores')
    .select('id, nombre, rol, activo, auth_user_id, studio_id, email')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, { tags: { area: 'equipo', accion: 'reclamar' } });
    throw new ErrorAccion(ERROR_SISTEMA, 500);
  }
  if (!ficha) throw new ErrorAccion(MENSAJE_RECHAZO.FICHA_INACTIVA, 404);

  // Ya es suya: el mismo enlace puede llegar dos veces (una respuesta perdida, y
  // /login lo reintenta en el siguiente acceso). Se mira ANTES que la revocación
  // porque al vincular el enlace queda gastado, y la repetición no es un error.
  if (ficha.auth_user_id === user.id) return { vinculadas: 0, yaEra: true, estudioId: ficha.studio_id };

  // La firma+scope+caducidad ya los validó verificarTokenInstructora — esto
  // comprueba, además, que sea el enlace vigente: reenviar la invitación firma
  // uno nuevo y revoca el anterior, y canjearla la deja gastada.
  if (await enlaceRevocado(admin, claim.instructorId, 'invitacion', token)) {
    throw new ErrorAccion(ENLACE_NO_VALIDO, 400);
  }

  const motivo = motivoNoReclamable(
    { rol: ficha.rol as Rol, activo: ficha.activo as boolean | null, authUserId: ficha.auth_user_id, email: ficha.email },
    user.id,
    rolDelEnlace(claim.ref),
    {
      rolFirmado: rolDelEnlace(claim.rolFicha),
      cuenta: { email: user.email ?? null, emailConfirmado: Boolean(user.email_confirmed_at) },
    },
  );

  if (motivo) {
    console.warn('[equipo:reclamar] rechazo', motivo, 'ficha', ficha.id, 'rol', ficha.rol, 'emisor', claim.ref);
    throw new ErrorAccion(MENSAJE_RECHAZO[motivo], estadoHttpDelRechazo(motivo));
  }

  // Unirse no puede cambiarle a nadie el estudio en el que abre su panel: una
  // propietaria (o quien ya trabaja en varias sedes) que acepta esta invitación
  // sin sede guardada acabaría abriendo el panel de ESTE estudio. Ver
  // `lib/equipo/conservar-estudio-panel.ts`.
  try {
    await conservarEstudioDelPanel(admin, user.id);
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'equipo', accion: 'reclamar' } });
    throw new ErrorAccion(ERROR_SISTEMA, 500);
  }

  // El UPDATE repite lo que se acaba de comprobar (sin cuenta, mismo rol, mismo
  // correo, esta sede, no dada de baja): si la ficha cambia entre la lectura y
  // la escritura, no se une con lo de antes.
  const { data: tocadas, error: errUpdate } = await admin
    .from('instructores')
    .update({ auth_user_id: user.id })
    .eq('id', ficha.id)
    .eq('studio_id', ficha.studio_id)
    .eq('rol', ficha.rol as string)
    .eq('email', ficha.email as string)
    .not('activo', 'is', false)
    .is('auth_user_id', null)
    .select('id');

  // UNIQUE(auth_user_id, studio_id): ya tiene otra ficha en esta sede.
  if (errUpdate?.code === '23505') throw new ErrorAccion(OTRO_ACCESO, 409);
  // `instructores_no_reactivar_eliminada`: la persona se eliminó (art. 17).
  if (errUpdate?.message?.includes('PERSONA_ELIMINADA')) throw new ErrorAccion(MENSAJE_RECHAZO.FICHA_INACTIVA, 404);
  if (errUpdate) {
    Sentry.captureException(errUpdate, { tags: { area: 'equipo', accion: 'reclamar' } });
    throw new ErrorAccion(ERROR_SISTEMA, 500);
  }

  if ((tocadas?.length ?? 0) === 0) {
    // Nadie tocado: la ficha cambió entre la lectura y la escritura. Si es que
    // otra petición de esta misma cuenta (otra pestaña, la otra puerta) la ha
    // unido a la vez, ya está hecho.
    const { data: ahora } = await admin.from('instructores').select('auth_user_id').eq('id', ficha.id).maybeSingle();
    if (ahora?.auth_user_id === user.id) return { vinculadas: 0, yaEra: true, estudioId: ficha.studio_id };
    throw new ErrorAccion(ENLACE_NO_VALIDO, 409);
  }

  try {
    await gastarInvitacion(admin, ficha.studio_id as string, ficha.id as string);
  } catch (e) {
    // El acceso ya está dado; el enlace sigue acotado por su caducidad y por
    // que la ficha ya tiene cuenta.
    Sentry.captureException(e, { tags: { area: 'equipo', accion: 'reclamar-gastar' } });
  }
  await avisarAlEstudioAccesoActivado(admin, ficha.studio_id as string, ficha.nombre as string, ficha.rol as Rol, user.email ?? null);

  return { vinculadas: 1, estudioId: ficha.studio_id };
}
