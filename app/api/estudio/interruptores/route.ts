import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { interruptoresPara } from '@/lib/estudio/interruptores';

export const dynamic = 'force-dynamic';

// Qué funcionalidades que entran apagadas están encendidas para el estudio de
// la sesión (lib/estudio/interruptores.ts). Solo booleanos: ni las variables
// ni los ids de estudio salen de aquí. El estudio sale SIEMPRE de la sesión;
// `?estudio=` solo sirve para contestar «todo apagado» si no coincide.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const pedido = req.nextUrl.searchParams.get('estudio');
  return NextResponse.json(interruptoresPara(sesion.studioId, pedido, process.env), { headers: { 'Cache-Control': 'no-store' } });
}
