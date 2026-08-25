import { NextRequest, NextResponse } from 'next/server';
import { equipoRendimientoAction } from '@/lib/actions/equipo/equipoRendimientoAction';

export async function GET(req: NextRequest) {
  try {
    const result = await equipoRendimientoAction();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 });
  }
}
