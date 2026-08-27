import { NextRequest, NextResponse } from 'next/server';
import { equipoAction } from '@/lib/actions/equipo/equipoAction';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';

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
    return respuestaDeErrorAccion('equipo:route', error);
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
