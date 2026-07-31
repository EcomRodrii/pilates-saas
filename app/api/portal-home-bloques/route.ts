import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getHomeBloquesBorrador, guardarHomeBloquesBorrador } from '@/lib/layout-data';
import { bloqueHomeSchema } from '@/lib/layout-schema';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import { z } from 'zod';

// GET /api/portal-home-bloques → bloques BORRADOR del Inicio del portal (editor).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json(await getHomeBloquesBorrador(sesion.studioId));
}

// PUT /api/portal-home-bloques → guarda (reemplaza) el BORRADOR. No publica.
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarPortalHome(sesion.rol))
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia pueden editar el Inicio del portal' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = z.array(bloqueHomeSchema).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'Bloques inválidos', detalles: parsed.error.issues }, { status: 400 });

  try {
    return NextResponse.json(await guardarHomeBloquesBorrador(sesion.studioId, parsed.data));
  } catch (e) {
    return errorInterno('portal-home-bloques:guardar', e,
      'No se han podido guardar los bloques del Inicio. Vuelve a intentarlo.');
  }
}
