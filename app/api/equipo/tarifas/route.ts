import { NextRequest, NextResponse } from 'next/server';
import { equipoTarifasAction } from '@/lib/actions/equipo/equipoTarifasAction';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';

/**
 * DEPRECATED: Use Server Action instead
 * @see lib/actions/equipo/equipoTarifasAction
 */

export async function GET(_req: NextRequest) {
  try {
    const result = await equipoTarifasAction({ method: 'GET' });
    return NextResponse.json(result);
  } catch (error) {
    return respuestaDeErrorAccion('equipo:tarifas:GET', error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await equipoTarifasAction({ ...body, method: 'PATCH' });
    return NextResponse.json(result);
  } catch (error) {
    return respuestaDeErrorAccion('equipo:tarifas:PATCH', error);
  }
}
