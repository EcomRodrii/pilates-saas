import { NextRequest, NextResponse } from 'next/server';
import { equipoReclamarAction } from '@/lib/actions/equipo/equipoReclamarAction';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Rate limiting: max 20 intentos por minuto
  const limited = await enforceRateLimit(req, 'equipo-reclamar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
    const body = await req.json().catch(() => ({}));
    const result = await equipoReclamarAction({ ...body, jwt });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    let status = 500;

    if (message.includes('no vale')) status = 400;
    if (message.includes('No autorizado')) status = 401;
    // Mensajes de MENSAJE_RECHAZO -> 409, salvo FICHA_INACTIVA -> 404
    if (message.includes('No estás autorizada') || message.includes('Es instructor pero')) status = 409;
    if (message.includes('Ficha inactiva') || message.includes('desactivada')) status = 404;

    return NextResponse.json({ error: message }, { status });
  }
}
