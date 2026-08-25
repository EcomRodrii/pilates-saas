import { NextRequest, NextResponse } from 'next/server';
import { equipoTarifasAction } from '@/lib/actions/equipo/equipoTarifasAction';

/**
 * DEPRECATED: Use Server Action instead
 * @see lib/actions/equipo/equipoTarifasAction
 */

export async function GET(_req: NextRequest) {
  try {
    const result = await equipoTarifasAction({ method: 'GET' });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    let status = 500;

    if (message.includes('No autorizado')) status = 401;
    if (message.includes('No tienes permiso')) status = 403;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await equipoTarifasAction({ ...body, method: 'PATCH' });
    return NextResponse.json(result);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error';
    let status = 500;
    if (mensaje.includes('No tienes permiso')) status = 403;
    if (mensaje.includes('Falta')) status = 400;
    if (mensaje.includes('no encontrada')) status = 404;
    return NextResponse.json({ error: mensaje }, { status });
  }
}
