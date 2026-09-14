import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerDatosPrivadosSocia } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarNifSocia } from '@/lib/socios/datos-privados';

// Guardar el NIF de una clienta desde el panel.
//
// Es un dato privado (M1, auditoría RGPD): `authenticated` ya no tiene UPDATE
// sobre esa columna (migr 20260914190000), así que la ficha no puede escribirlo
// con la sesión del navegador. Lo escribe esta ruta, con service-role, después
// de comprobar aquí el mismo permiso que decide quién lo VE
// (`puedeVerDatosPrivadosSocia`: PROPIETARIO y RECEPCION) y siempre acotado al
// estudio de la sesión — el `socioId` de la URL no basta por sí solo.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerDatosPrivadosSocia(sesion.rol)) {
    return NextResponse.json({ error: 'Solo la propietaria o recepción pueden cambiar el NIF de una clienta.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-nif', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const body = (await req.json().catch(() => null)) as { nif?: unknown } | null;
  if (!body || !('nif' in body)) return NextResponse.json({ error: 'Falta el NIF.' }, { status: 400 });
  const nif = normalizarNifSocia(body.nif);
  if (nif === undefined) return NextResponse.json({ error: 'El NIF no es válido.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });

  try {
    const { data, error } = await admin.from('socios')
      .update({ nif })
      .eq('id', socioId)
      .eq('studio_id', sesion.studioId)
      .is('borrado_en', null)
      .select('id');
    if (error) return errorInterno('socios/nif:PUT', error, 'No se ha podido guardar el NIF.');
    if (!data?.length) return NextResponse.json({ error: 'No encontramos a esa clienta.' }, { status: 404 });
    return NextResponse.json({ ok: true, nif });
  } catch (e) {
    return errorInterno('socios/nif:PUT', e, 'No se ha podido guardar el NIF.');
  }
}
