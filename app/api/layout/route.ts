import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getLayout, guardarLayout } from '@/lib/layout-data';
import { layoutDraftSchema } from '@/lib/layout-schema';

// GET /api/layout → config de menú del estudio del staff autenticado.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json(await getLayout(sesion.studioId));
}

// PUT /api/layout → guarda la config de menú. Solo PROPIETARIO.
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede configurar el menú' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = layoutDraftSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'Configuración inválida', detalles: parsed.error.issues }, { status: 400 });

  try {
    return NextResponse.json(await guardarLayout(sesion.studioId, parsed.data));
  } catch (e) {
    return errorInterno('layout:guardar', e,
      'No se ha podido guardar el menú. Vuelve a intentarlo.');
  }
}
