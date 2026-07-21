import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetRecomendacion, dbTransicionarRecomendacion } from '@/lib/decision/db';
import { inngest, EVENTS } from '@/lib/inngest/client';

// POST /api/decisiones/[id]/aprobar — transición condicional PENDIENTE→APROBADA
// (doble-clic-seguro, DECISION-OS-ARQUITECTURA.md §7) + encola la ejecución.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id } = await params;

  const recomendacion = await dbGetRecomendacion(id);
  if (!recomendacion) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (recomendacion.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  const resultado = await dbTransicionarRecomendacion(id, sesion.studioId, 'PENDIENTE', 'APROBADA', {
    resueltoPor: sesion.userId,
    resueltoEn: new Date().toISOString(),
  });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo ?? 'No se pudo aprobar' }, { status: 409 });
  }

  await inngest.send({ name: EVENTS.DECISION_APPROVED, data: { recomendacionId: id } });

  return NextResponse.json({ estado: 'APROBADA' });
}
