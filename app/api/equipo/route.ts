import { NextRequest, NextResponse } from 'next/server';
import { equipoAction } from '@/lib/actions/equipo/equipoAction';

/**
 * DEPRECATED: Use the Server Action instead
 * @see lib/actions/equipo/equipoAction
 *
 * This route exists only for backward compatibility with existing clients.
 * New code should call the Server Action directly.
 */

async function handleRequest(req: NextRequest, method: string) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await equipoAction({ ...body, method });
    return NextResponse.json(result);
  } catch (error) {
    const message = (error as Error)?.message || 'Error procesando la solicitud';
    let status = 500;

    if (message.includes('No autorizado')) status = 401;
    if (message.includes('No tienes permiso')) status = 403;
    if (message.includes('Faltan datos') || message.includes('Falta')) status = 400;
    if (message.includes('no encontrada')) status = 404;
    if (message.includes('Ya hay alguien')) status = 409;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  return handleRequest(req, 'POST');
}

export async function PATCH(req: NextRequest) {
  return handleRequest(req, 'PATCH');
}

export async function DELETE(req: NextRequest) {
  return handleRequest(req, 'DELETE');
}
