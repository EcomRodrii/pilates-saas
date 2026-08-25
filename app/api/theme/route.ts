import { NextRequest, NextResponse } from 'next/server';
import { getThemeAction, guardarThemeAction } from '@/lib/actions/theme';

// DEPRECATED: Mantener para compatibilidad backwards. Usar lib/actions/theme.ts directamente en componentes.

export async function GET(req: NextRequest) {
  try {
    const draft = req.nextUrl.searchParams.get('draft') === '1';
    const result = await getThemeAction(draft);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || 'No autorizado' },
      { status: 401 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const result = await guardarThemeAction(body);
    return NextResponse.json(result);
  } catch (e) {
    const message = (e as Error).message || 'Error';
    const status = message.includes('propietario') ? 403 : message.includes('plan') ? 403 : message.includes('inválido') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
