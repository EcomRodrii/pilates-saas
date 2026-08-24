import { NextRequest, NextResponse } from 'next/server';
import { getLayoutAction, guardarLayoutAction } from '@/lib/actions/layout';

// DEPRECATED: Mantener para compatibilidad backwards. Usar lib/actions/layout.ts directamente en componentes.

export async function GET(_req: NextRequest) {
  try {
    const result = await getLayoutAction();
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
    const result = await guardarLayoutAction(body);
    return NextResponse.json(result);
  } catch (e) {
    const message = (e as Error).message || 'Error';
    const status = message.includes('propietario') ? 403 : message.includes('inválida') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
