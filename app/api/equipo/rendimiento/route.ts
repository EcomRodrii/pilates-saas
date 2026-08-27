import { NextRequest, NextResponse } from 'next/server';
import { equipoRendimientoAction } from '@/lib/actions/equipo/equipoRendimientoAction';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';

export async function GET(_req: NextRequest) {
  try {
    const result = await equipoRendimientoAction();
    return NextResponse.json(result);
  } catch (error) {
    return respuestaDeErrorAccion('equipo:rendimiento', error);
  }
}
