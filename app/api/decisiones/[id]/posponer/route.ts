import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetRecomendacion, dbPosponerRecomendacion, dbLogActividadReciente } from '@/lib/decision/db';

const DIAS_POSPONER = 4;
const MS_DIA = 86400000;

// POST /api/decisiones/[id]/posponer — "Recuérdamelo": la recomendación sigue
// PENDIENTE (no es Aprobar ni Rechazar), solo se aplaza su vencimiento unos
// días. El Umbral no la repite antes por su puerta de novedad.
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

  const nuevaExpiraEn = new Date(Date.now() + DIAS_POSPONER * MS_DIA).toISOString();
  const resultado = await dbPosponerRecomendacion(id, sesion.studioId, nuevaExpiraEn);
  if (!resultado.ok) {
    return NextResponse.json({ error: 'No se pudo posponer (¿ya no está pendiente?)' }, { status: 409 });
  }

  await dbLogActividadReciente({
    studioId: recomendacion.studioId, tipo: 'DECISION_GESTIONADA',
    texto: `Pospuesta unos días: ${recomendacion.titulo}`, socioId: recomendacion.socioId,
  });

  return NextResponse.json({ ok: true, expiraEn: nuevaExpiraEn });
}
