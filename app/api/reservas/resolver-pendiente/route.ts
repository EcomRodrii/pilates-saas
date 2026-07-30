import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { resolverReservaPendiente } from '@/lib/db/supabase-data-admin';

export const dynamic = 'force-dynamic';

// Aprobar/rechazar una reserva PENDIENTE_APROBACION (Fase 2a). El estudio
// SIEMPRE se resuelve de la sesión de staff, nunca del body — mismo criterio
// que el resto de rutas de este archivo.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reservaId?: string; aprobar?: boolean } | null;
  if (!body?.reservaId || typeof body.aprobar !== 'boolean') {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const r = await resolverReservaPendiente({
    studioId: sesion.studioId, reservaId: body.reservaId, aprobar: body.aprobar,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
