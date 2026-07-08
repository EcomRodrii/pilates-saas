import { NextRequest, NextResponse } from 'next/server';
import { crearReservaPublica, cancelarReservaPublica } from '@/lib/supabase-data';

// Crear o cancelar una reserva desde las páginas públicas (reserva/portal),
// con service-role y validación de identidad de la socia (id + email). Sustituye
// las escrituras anónimas directas sobre la tabla reservas.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    accion?: 'crear' | 'cancelar';
    studioId?: string;
    sesionId?: string;
    reservaId?: string;
    socioId?: string;
    email?: string;
  } | null;

  if (!body?.studioId || !body?.socioId || !body?.email) {
    return NextResponse.json({ error: 'Faltan datos de la socia' }, { status: 400 });
  }

  try {
    if (body.accion === 'crear') {
      if (!body.sesionId) return NextResponse.json({ error: 'Falta la sesión' }, { status: 400 });
      const r = await crearReservaPublica({
        studioId: body.studioId, sesionId: body.sesionId, socioId: body.socioId, email: body.email,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'cancelar') {
      if (!body.reservaId) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 });
      const r = await cancelarReservaPublica({
        studioId: body.studioId, reservaId: body.reservaId, socioId: body.socioId, email: body.email,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al procesar la reserva';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
