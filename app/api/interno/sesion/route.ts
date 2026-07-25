import { NextRequest, NextResponse } from 'next/server';
import { verificarAdminInterno } from '@/lib/interno/auth';

// Quién soy en el panel interno. La UI la usa para decidir qué pintar; la
// autorización de verdad la hace cada ruta por su cuenta (nunca el cliente).
export async function GET(req: NextRequest) {
  const admin = await verificarAdminInterno(req);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({
    nombre: admin.nombre, cargo: admin.cargo, email: admin.email, permisos: admin.permisos,
  });
}
