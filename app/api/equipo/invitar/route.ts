import { NextRequest, NextResponse } from 'next/server';
import { equipoInvitarAction } from '@/lib/actions/equipo/equipoInvitarAction';

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
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    let status = 500;

    if (message.includes('No autorizado')) status = 401;
    if (message.includes('No tienes permiso')) status = 403;
    if (message.includes('Falta')) status = 400;
    if (message.includes('no está en tu equipo')) status = 404;
    if (message.includes('ya tiene su acceso creado')) status = 409;

    return NextResponse.json({ error: message }, { status });
  }
}
