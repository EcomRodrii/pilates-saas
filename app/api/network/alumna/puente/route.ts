import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

// F3 de Network — "el puente": si la persona que entra a Network como
// alumna resulta ser YA socia de algún estudio Tentare, se lo decimos y le
// damos el enlace a su portal real (/portal/[slug]), donde ya tiene sus
// reservas/bonos/datos. Aviso PASIVO (decisión confirmada con el fundador):
// solo se muestra cuando la alumna entra a Network, sin notificación push
// ni email nueva.
//
// Consulta con service-role y SIN filtrar por studio_id a propósito: una
// misma persona puede ser socia de varios estudios (mismo criterio que
// `mis_estudios()` para instructoras/propietarias), así que hay que mostrar
// todos los que apliquen, no asumir que solo puede ser uno.
//
// Nunca se selecciona email/telefono aquí: la alumna ya tiene esos datos en
// su propio portal — este endpoint solo resuelve "¿a qué portal la mando?".
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('socios')
    .select('id, studio_id, studios ( nombre, slug )')
    .eq('auth_user_id', usuario.userId);
  if (error) return errorInterno('network:alumna:puente:GET', error, 'No se ha podido comprobar si ya eres socia de algún estudio.');

  type Fila = { id: string; studio_id: string; studios: { nombre: string | null; slug: string | null } | null };
  const estudios = ((data ?? []) as unknown as Fila[])
    .filter(f => f.studios?.slug)
    .map(f => ({ studioId: f.studio_id, nombre: f.studios!.nombre ?? 'tu estudio', slug: f.studios!.slug as string }));

  return NextResponse.json({ estudios });
}
