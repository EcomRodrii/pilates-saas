import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { publicarHomeBloques } from '@/lib/layout-data';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';

// POST /api/portal-home-bloques/publish → publica el borrador (copia draft → publicado).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarPortalHome(sesion.rol))
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia pueden publicar el Inicio del portal' }, { status: 403 });

  try {
    return NextResponse.json(await publicarHomeBloques(sesion.studioId));
  } catch (e) {
    return errorInterno('portal-home-bloques:publicar', e,
      'No se han podido publicar los bloques del Inicio. Vuelve a intentarlo.');
  }
}
