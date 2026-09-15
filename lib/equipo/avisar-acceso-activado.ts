import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarEmailAccesoActivado } from '@/lib/emails/acceso-activado-server';

// Aviso al estudio de que alguien de su equipo ha activado su acceso.
//
// Lo comparten las dos puertas por las que una ficha de equipo se une a una
// cuenta: el enlace de invitación (`equipoReclamarAction`) y el «Entrar como
// instructora» de la app (`/api/portal/instructora/unirse`). Fuera del fichero
// de la acción a propósito: todo lo que exporta un `'use server'` se puede
// llamar desde el navegador, y esto manda correos.
//
// Un fallo aquí no deshace nada: el acceso ya está activado.
export async function avisarAlEstudioAccesoActivado(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  studioId: string, nombreFicha: string, emailCuenta: string | null,
): Promise<void> {
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
    console.error('[equipo:acceso-activado] aviso al estudio', e);
  }
}
