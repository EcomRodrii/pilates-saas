import { NextRequest, NextResponse } from 'next/server';
import { resolverSesionStaffConPaso } from '@/lib/auth-server';
import { esCuentaDeTentare } from '@/lib/auth/obligatoria-tentare';

// Qué le falta a esta sesión del panel de verificación en dos pasos
// (lib/auth/doble-factor-reglas.ts): 'ok', 'verificar' o 'activar'. Lo lee el
// panel al arrancar para mandar a /verificar-acceso, y la propia pantalla.
//
// No da ningún dato del estudio: por eso puede contestar a una sesión que aún
// no ha pasado el segundo paso (las demás rutas, con `verificarSesionStaff`,
// le contestan 401).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const r = await resolverSesionStaffConPaso(req);
  if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // `obligatoriaTentare`: Mi perfil no ofrece quitarla (lib/auth/obligatoria-tentare.ts).
  const obligatoriaTentare = r.factores > 0 && await esCuentaDeTentare(r.sesion.userId);
  return NextResponse.json(
    { paso: r.paso, factores: r.factores, estudioLoExige: r.estudioLoExige, rol: r.sesion.rol, obligatoriaTentare },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
