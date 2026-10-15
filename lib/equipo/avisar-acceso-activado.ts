import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarEmailAccesoActivado } from '@/lib/emails/acceso-activado-server';
import { emailDeLaPropietaria } from '@/lib/notifications/recipients';
import type { Rol } from '@/lib/types';

// Aviso al estudio de que alguien de su equipo ha activado su acceso.
//
// Lo comparten las dos puertas por las que una ficha de equipo se une a una
// cuenta: el enlace de invitación (`equipoReclamarAction`) y el «Entrar como
// instructora» de la app (`/api/portal/instructora/unirse`). Fuera del fichero
// de la acción a propósito: todo lo que exporta un `'use server'` se puede
// llamar desde el navegador, y esto manda correos.
//
// Un fallo aquí no deshace nada: el acceso ya está activado.
//
// Va al correo del estudio y, si no tiene (10 de 13 el 13-oct-2026), al de la
// cuenta de la propietaria (`emailDeLaPropietaria`, el mismo criterio que los
// avisos del motor de notificaciones). Antes salía sin hacer nada, y este aviso
// es como la propietaria se entera de un acceso que no esperaba.
export async function avisarAlEstudioAccesoActivado(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  studioId: string, nombreFicha: string, rol: Rol, emailCuenta: string | null,
): Promise<void> {
  try {
    const { data: studio } = await admin
      .from('studios')
      .select('nombre, email, owner_auth_user_id, color_primario, logo_url')
      .eq('id', studioId)
      .maybeSingle();
    if (!studio) return;
    const to = studio.owner_auth_user_id
      ? await emailDeLaPropietaria(admin, studio.owner_auth_user_id as string, studio.email)
      : ((studio.email as string | null) ?? '').trim() || null;
    if (!to) return;
    await enviarEmailAccesoActivado({
      to,
      nombre: nombreFicha,
      rol,
      emailCuenta,
      estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
      colorPrimario: studio.color_primario as string | null,
      logoUrl: studio.logo_url as string | null,
    });
  } catch (e) {
    console.error('[equipo:acceso-activado] aviso al estudio', e);
  }
}
