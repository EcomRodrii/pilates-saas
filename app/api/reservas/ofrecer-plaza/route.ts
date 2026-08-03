import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { ofrecerPlazaLibre } from '@/lib/db/supabase-data-admin';

export const dynamic = 'force-dynamic';

// Rediseño del Calendario — acción "Ofrecer plaza" de la franja de decisiones
// (solo aparece cuando hay hueco libre de verdad, ver lib/calendario-estado.ts
// pideDecision/huecosLibres). El estudio SIEMPRE se resuelve de la sesión de
// staff, nunca del body — mismo criterio que resolver-pendiente.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { sesionId?: string } | null;
  if (!body?.sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  const r = await ofrecerPlazaLibre({ studioId: sesion.studioId, sesionId: body.sesionId });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
