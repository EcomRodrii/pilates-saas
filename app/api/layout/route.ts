import { NextRequest, NextResponse } from 'next/server';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';
import { getLayoutAction, guardarLayoutAction } from '@/lib/actions/layout';

// DEPRECATED: Mantener para compatibilidad backwards. Usar lib/actions/layout.ts directamente en componentes.

export async function GET(_req: NextRequest) {
  try {
    const result = await getLayoutAction();
    return NextResponse.json(result);
  } catch (e) {
    return respuestaDeErrorAccion('layout:GET', e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const result = await guardarLayoutAction(body);
    return NextResponse.json(result);
  } catch (e) {
    return respuestaDeErrorAccion('layout:PUT', e);
  }
}
