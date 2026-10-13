import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVer } from '@/lib/permisos-reglas';
import { euroPorPlazaEncendido } from '@/lib/interruptor-por-estudio';

export const dynamic = 'force-dynamic';

// ¿Está encendido el mapa de «€ por plaza ofertada» para este estudio? (pieza E,
// interruptor `INFORMES_EURO_PLAZA`). Solo un booleano: ni la variable ni ids de
// estudio salen de aquí, y el estudio sale SIEMPRE de la sesión. El mapa se
// calcula en el navegador con datos que la propietaria ya lee: esto es un
// interruptor de producto, no la cerradura (la cerradura es la RLS de recibos).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const disponible = puedeVer(sesion.rol, '/informes') && euroPorPlazaEncendido(sesion.studioId);
  return NextResponse.json({ disponible }, { headers: { 'Cache-Control': 'no-store' } });
}
