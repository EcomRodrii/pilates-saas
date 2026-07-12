import { NextRequest, NextResponse } from 'next/server';
import { checkinPublico, validarKioskToken } from '@/lib/supabase-data';

// Check-in de kiosk (service-role): marca la reserva ASISTIDA y otorga los
// créditos/premios correspondientes. La reserva se valida contra el estudio.
// SEGURIDAD (C-2): exige el token de dispositivo del kiosko (cabecera
// x-kiosk-token). Sin él, cualquiera podía POSTear {studioId,reservaId} y
// mintear créditos canjeables en cualquier estudio, con ids enumerables desde
// /api/public/studio-data. Con token inválido/ausente → 401, y la enumeración
// de reservaId queda inofensiva.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    studioId?: string; reservaId?: string;
  } | null;

  if (!body?.studioId || !body?.reservaId) {
    return NextResponse.json({ error: 'Faltan datos del check-in' }, { status: 400 });
  }

  const kioskToken = req.headers.get('x-kiosk-token');
  if (!(await validarKioskToken(body.studioId, kioskToken))) {
    return NextResponse.json({ error: 'Kiosko no autorizado' }, { status: 401 });
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
