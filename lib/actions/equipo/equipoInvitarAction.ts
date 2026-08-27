'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { enviarEmailInvitacionEquipo } from '@/lib/emails/invitacion-equipo-server';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';
import { ErrorAccion } from '@/lib/actions/errores';

/**
 * equipoInvitarAction
 * Migrated from: app/api/equipo/invitar/route.ts
 * Envía (o reenvía) email de invitación a una instructora ya registrada
 */

export async function equipoInvitarAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new ErrorAccion('No tienes permiso para invitar al equipo', 403);
  }

  const instructorId = typeof input?.instructorId === 'string' ? input.instructorId : null;
  if (!instructorId) {
    throw new ErrorAccion('Falta a quién invitar', 400);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ErrorAccion('Servidor no configurado', 503);
  }

  const { data: instructor } = await admin
    .from('instructores')
    .select('id, nombre, email, rol, auth_user_id')
    .eq('id', instructorId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!instructor) {
    throw new ErrorAccion('Esa persona ya no está en tu equipo.', 404);
  }

  if (sesion.rol !== 'PROPIETARIO'
      && !rolesQuePuedeAsignar(sesion.rol).includes(instructor.rol as never)) {
    throw new ErrorAccion('No puedes invitar a esta persona. Pídeselo a la propietaria.', 403);
  }

  if (!instructor.email) {
    throw new ErrorAccion('Esa persona no tiene email en su ficha. Añádeselo y vuelve a intentarlo.', 400);
  }

  if (instructor.auth_user_id) {
    throw new ErrorAccion('Esa persona ya tiene su acceso creado, no necesita invitación.', 409);
  }

  const { data: studio } = await admin
    .from('studios')
    .select('nombre, color_primario, logo_url')
    .eq('id', sesion.studioId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  await enviarEmailInvitacionEquipo({
    to: instructor.email as string,
    nombre: instructor.nombre as string,
    propietariaNombre: sesion.nombre,
    estudioNombre: studio?.nombre ?? 'tu estudio',
    colorPrimario: studio?.color_primario,
    logoUrl: studio?.logo_url,
    rol: instructor.rol as string,
    url: `${appUrl}/invitacion?token=${encodeURIComponent(
      firmarTokenInstructora(instructor.id as string, sesion.studioId, 'invitacion', sesion.rol),
    )}`,
  });

  return { ok: true, email: instructor.email };
}
