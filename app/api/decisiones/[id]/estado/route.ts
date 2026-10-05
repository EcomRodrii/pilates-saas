import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetEstadoRecomendacion } from '@/lib/decision/db';
import { bloqueoPorPlan } from '@/lib/decision/plan-servidor';

// GET /api/decisiones/[id]/estado — cómo va una recomendación aprobada: su
// estado y lo que pasó al ejecutarla (`resultado`, lib/decision/resultado-ejecucion.ts).
// Lo pregunta la pantalla cada pocos segundos tras «Cobrar ahora», con un tope
// (components/decision/use-decisiones.ts), para decir si se cobró o por qué no
// en vez de un «Cobro en marcha» para toda la sesión. Una sola consulta, acotada
// al estudio de la sesión: la de otro estudio responde 404, igual que una que no
// existe. Mismo rol y misma puerta del plan que el resto del Centro de Control.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const sinPlan = await bloqueoPorPlan(sesion.studioId);
  if (sinPlan) return sinPlan;

  const { id } = await params;
  const estado = await dbGetEstadoRecomendacion(id, sesion.studioId);
  if (estado === undefined) return NextResponse.json({ error: 'No se ha podido leer. Vuelve a intentarlo.' }, { status: 500 });
  if (estado === null) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json(estado);
}
