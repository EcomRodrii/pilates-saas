import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { publicarBloques } from '@/lib/layout-data';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import { PANTALLA_IDS, type PantallaId } from '@/lib/portal-home-bloques';

function pantallaDe(req: NextRequest): PantallaId | null {
  const raw = req.nextUrl.searchParams.get('pantalla') ?? 'home';
  return (PANTALLA_IDS as readonly string[]).includes(raw) ? (raw as PantallaId) : null;
}

// POST /api/portal-bloques/publish?pantalla=home|clases|bonos → publica el borrador de esa pantalla (copia draft → publicado).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarPortalHome(sesion.rol))
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia pueden publicar los bloques del portal' }, { status: 403 });
  const pantalla = pantallaDe(req);
  if (!pantalla) return NextResponse.json({ error: 'Pantalla desconocida' }, { status: 400 });

  try {
    return NextResponse.json(await publicarBloques(sesion.studioId, pantalla));
  } catch (e) {
    return errorInterno('portal-bloques:publicar', e,
      'No se han podido publicar los bloques. Vuelve a intentarlo.');
  }
}
