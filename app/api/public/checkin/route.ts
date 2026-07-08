import { NextRequest, NextResponse } from 'next/server';
import { checkinPublico } from '@/lib/supabase-data';

// Check-in de kiosk (service-role): marca la reserva ASISTIDA y otorga los
// créditos/premios correspondientes. La reserva se valida contra el estudio.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    studioId?: string; reservaId?: string;
  } | null;

  if (!body?.studioId || !body?.reservaId) {
    return NextResponse.json({ error: 'Faltan datos del check-in' }, { status: 400 });
  }

  try {
    const r = await checkinPublico({ studioId: body.studioId, reservaId: body.reservaId });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 404 });
    return NextResponse.json(r);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error en el check-in';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
