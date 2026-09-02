import { NextRequest, NextResponse } from 'next/server';
import { equipoInvitarAction } from '@/lib/actions/equipo/equipoInvitarAction';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';

/**
 * DEPRECATED: Use the Server Action instead
 * @see lib/actions/equipo/equipoInvitarAction
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await equipoInvitarAction(body);
    return NextResponse.json(result);
  } catch (error) {
    return respuestaDeErrorAccion('equipo:invitar', error);
  }
}
