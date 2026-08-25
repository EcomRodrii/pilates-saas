'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { enviarEmailInvitacionEquipo } from '@/lib/emails/invitacion-equipo-server';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';

/**
 * equipoInvitarAction
 * Migrated from: app/api/equipo/invitar/route.ts
 * Envía (o reenvía) email de invitación a una instructora ya registrada
 */

export async function equipoInvitarAction(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new Error('No tienes permiso para invitar al equipo');
  }

  const instructorId = typeof input?.instructorId === 'string' ? input.instructorId : null;
  if (!instructorId) {
    throw new Error('Falta a quién invitar');
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  const { data: instructor } = await admin
    .from('instructores')
    .select('id, nombre, email, rol, auth_user_id')
    .eq('id', instructorId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!instructor) {
    throw new Error('Esa persona ya no está en tu equipo.');
  }

  if (sesion.rol !== 'PROPIETARIO'
      && !rolesQuePuedeAsignar(sesion.rol).includes(instructor.rol as never)) {
    throw new Error('No puedes invitar a esta persona. Pídeselo a la propietaria.');
  }

  if (!instructor.email) {
    throw new Error('Esa persona no tiene email en su ficha. Añádeselo y vuelve a intentarlo.');
  }

  if (instructor.auth_user_id) {
    throw new Error('Esa persona ya tiene su acceso creado, no necesita invitación.');
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
