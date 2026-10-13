import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { tuTentareVisible } from '@/lib/tu-tentare/interruptor';

export const dynamic = 'force-dynamic';

// ¿Ve este estudio «Tu Tentare» (P2.5) en Configuración › Tu panel? Solo la
// propietaria (la sección ya es solo suya) y solo si el interruptor
// `TU_TENTARE` lo enciende para su estudio. Contesta 200 también apagado: el
// panel lo pide al abrir la sección y, ante cualquier otra cosa, no enseña nada.
// El estudio sale de la sesión; ni la variable ni los ids salen de aquí.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const activo = tuTentareVisible(sesion.rol, process.env.TU_TENTARE, sesion.studioId);
  return NextResponse.json({ activo }, { headers: { 'Cache-Control': 'no-store' } });
}
