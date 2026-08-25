import { NextRequest, NextResponse } from 'next/server';
import { equipoRendimientoAction } from '@/lib/actions/equipo/equipoRendimientoAction';

export async function GET(_req: NextRequest) {
  try {
    const result = await equipoRendimientoAction();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || 'Error' }, { status: 500 });
  }
}
