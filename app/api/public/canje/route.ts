import { NextRequest, NextResponse } from 'next/server';
import { canjearRecompensaPublica } from '@/lib/supabase-data';

// Canje de una recompensa desde el portal de la socia (service-role +
// validación de identidad y saldo). Sustituye la escritura anónima directa.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    studioId?: string; socioId?: string; email?: string; catalogItemId?: string;
  } | null;

  if (!body?.studioId || !body?.socioId || !body?.email || !body?.catalogItemId) {
    return NextResponse.json({ error: 'Faltan datos del canje' }, { status: 400 });
  }

  try {
    const r = await canjearRecompensaPublica({
      studioId: body.studioId, socioId: body.socioId, email: body.email, catalogItemId: body.catalogItemId,
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
    return NextResponse.json(r);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al canjear';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
