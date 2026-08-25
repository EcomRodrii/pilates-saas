import { NextRequest, NextResponse } from 'next/server';
import { respuestaDeErrorAccion } from '@/lib/actions/errores';
import { getThemeAction, guardarThemeAction } from '@/lib/actions/theme';

// DEPRECATED: Mantener para compatibilidad backwards. Usar lib/actions/theme.ts directamente en componentes.

export async function GET(req: NextRequest) {
  try {
    const draft = req.nextUrl.searchParams.get('draft') === '1';
    const result = await getThemeAction(draft);
    return NextResponse.json(result);
  } catch (e) {
    return respuestaDeErrorAccion('theme:GET', e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const result = await guardarThemeAction(body);
    return NextResponse.json(result);
  } catch (e) {
    return respuestaDeErrorAccion('theme:PUT', e);
  }
}
