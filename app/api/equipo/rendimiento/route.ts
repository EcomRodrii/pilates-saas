import { NextRequest, NextResponse } from 'next/server';
import { equipoRendimientoAction } from '@/lib/actions/equipo/equipoRendimientoAction';

export async function GET(_req: NextRequest) {
  try {
    const result = await equipoRendimientoAction();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
