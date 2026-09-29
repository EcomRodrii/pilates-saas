import { NextRequest, NextResponse } from 'next/server';
import { comprobarAdminInterno, respuestaSinAccesoInterno } from '@/lib/interno/auth';

// Quién soy en el panel interno. La UI la usa para decidir qué pintar; la
// autorización de verdad la hace cada ruta por su cuenta (nunca el cliente).
// `nivel` solo puede llegar en 'aal1' aquí con `INTERNO_EXIGIR_MFA=0`
// explícito (un entorno de desarrollo) — con el default fail-closed,
// `comprobarAdminInterno` ya habría devuelto `MFA_REQUERIDO` antes.
export async function GET(req: NextRequest) {
  const r = await comprobarAdminInterno(req);
  if (!('admin' in r)) return respuestaSinAccesoInterno(r.motivo);
  const { admin } = r;
  return NextResponse.json({
    nombre: admin.nombre, cargo: admin.cargo, email: admin.email, permisos: admin.permisos, nivel: admin.nivel,
  });
}
