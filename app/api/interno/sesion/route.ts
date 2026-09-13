import { NextRequest, NextResponse } from 'next/server';
import { comprobarAdminInterno, respuestaSinAccesoInterno } from '@/lib/interno/auth';

// Quién soy en el panel interno. La UI la usa para decidir qué pintar; la
// autorización de verdad la hace cada ruta por su cuenta (nunca el cliente).
// `nivel` le sirve al layout para avisar de que esta sesión no pasó el segundo
// factor mientras la exigencia (`INTERNO_EXIGIR_MFA`) aún no está activa.
export async function GET(req: NextRequest) {
  const r = await comprobarAdminInterno(req);
  if (!('admin' in r)) return respuestaSinAccesoInterno(r.motivo);
  const { admin } = r;
  return NextResponse.json({
    nombre: admin.nombre, cargo: admin.cargo, email: admin.email, permisos: admin.permisos, nivel: admin.nivel,
  });
}
