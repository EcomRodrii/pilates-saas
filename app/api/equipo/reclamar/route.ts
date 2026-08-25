import { NextRequest, NextResponse } from 'next/server';
import { equipoReclamarAction } from '@/lib/actions/equipo/equipoReclamarAction';

export async function POST(req: NextRequest) {
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
    const body = await req.json().catch(() => ({}));
    const result = await equipoReclamarAction({ ...body, jwt });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.message?.includes('no vale') ? 400 : 
                   error?.message?.includes('No autorizado') ? 401 : 500;
    return NextResponse.json({ error: error?.message || 'Error' }, { status });
  }
}
