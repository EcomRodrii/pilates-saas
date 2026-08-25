import { NextRequest, NextResponse } from 'next/server';
import { equipoReclamarAction } from '@/lib/actions/equipo/equipoReclamarAction';

export async function POST(req: NextRequest) {
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
    const body = await req.json().catch(() => ({}));
    const result = await equipoReclamarAction({ ...body, jwt });
    return NextResponse.json(result);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error';
    const status = mensaje.includes('no vale') ? 400 :
                   mensaje.includes('No autorizado') ? 401 : 500;
    return NextResponse.json({ error: mensaje }, { status });
  }
}
