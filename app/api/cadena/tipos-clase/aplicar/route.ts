import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { aplicarCatalogoCadena } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';

// "Aplicar catálogo de la cadena a esta sede" — para sedes ya existentes (la
// sede nueva ya lo hace sola al crearse, ver app/api/cadena/sedes/route.ts).
// Solo inserta los tipos de clase de la plantilla que la sede destino todavía
// no tenga por nombre; nunca sobrescribe ni borra nada.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede aplicar el catálogo de la cadena' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { studioId?: string } | null;
  const studioId = body?.studioId;
  if (!studioId) return NextResponse.json({ error: 'Falta la sede destino' }, { status: 400 });

  // La sede destino debe pertenecer a la MISMA cadena que la sesión de la
  // propietaria — sin esto, cualquier studioId ajeno colaría tipos de clase
  // en una sede que no es suya.
  const [{ data: origen }, { data: destino }] = await Promise.all([
    admin.from('studios').select('cadena_id').eq('id', sesion.studioId).maybeSingle(),
    admin.from('studios').select('cadena_id').eq('id', studioId).maybeSingle(),
  ]);
  if (!origen?.cadena_id) {
    return NextResponse.json({ error: 'Este estudio no pertenece a ninguna cadena todavía' }, { status: 400 });
  }
  if (!destino || destino.cadena_id !== origen.cadena_id) {
    return NextResponse.json({ error: 'Esa sede no pertenece a tu cadena' }, { status: 403 });
  }

  try {
    const r = await aplicarCatalogoCadena({ cadenaId: origen.cadena_id as string, studioId });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('cadena/tipos-clase/aplicar:POST', err, 'No se pudo aplicar el catálogo. Inténtalo de nuevo.');
  }
}
