import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetRecomendacion, dbTransicionarRecomendacion, dbInsertOutcome, dbLogActividadReciente } from '@/lib/decision/db';
import { outcomeInmediato } from '@/lib/decision/outcomes';

// POST /api/decisiones/[id]/rechazar — transición condicional PENDIENTE→RECHAZADA
// + outcome inmediato (alimenta el cooldown y el ajuste de feedback del
// Priority Engine en el próximo análisis, DECISION-OS-NUCLEO.md §6.2).
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

  const nowISO = new Date().toISOString();
  const resultado = await dbTransicionarRecomendacion(id, 'PENDIENTE', 'RECHAZADA', {
    resueltoPor: sesion.userId,
    resueltoEn: nowISO,
  });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo ?? 'No se pudo rechazar' }, { status: 409 });
  }

  await dbInsertOutcome({
    studioId: recomendacion.studioId, recomendacionId: id, evento: 'RECHAZADA',
    outcome: outcomeInmediato('RECHAZADA'), senalObservada: null, ventanaDias: 0, medidoEn: nowISO,
  });

  await dbLogActividadReciente({
    studioId: recomendacion.studioId, tipo: 'DECISION_GESTIONADA',
    texto: `Descartada la recomendación: ${recomendacion.titulo}`, socioId: recomendacion.socioId,
  });

  return NextResponse.json({ estado: 'RECHAZADA' });
}
