import { NextRequest, NextResponse } from 'next/server';
import { equipoReclamarAction } from '@/lib/actions/equipo/equipoReclamarAction';
import { enforceRateLimit } from '@/lib/rate-limit';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';

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
    return respuestaDeErrorAccion('equipo:reclamar', error);
  }
}
