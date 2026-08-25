import { NextRequest, NextResponse } from 'next/server';
import { equipoTarifasAction } from '@/lib/actions/equipo/equipoTarifasAction';

/**
 * DEPRECATED: Use Server Action instead
 * @see lib/actions/equipo/equipoTarifasAction
 */

export async function GET(req: NextRequest) {
  try {
    const result = await equipoTarifasAction({ method: 'GET' });
    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || 'Error';
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
  } catch (error: any) {
    let status = 500;
    if (error?.message?.includes('No tienes permiso')) status = 403;
    if (error?.message?.includes('Falta')) status = 400;
    if (error?.message?.includes('no encontrada')) status = 404;
    return NextResponse.json({ error: error?.message || 'Error' }, { status });
  }
}
