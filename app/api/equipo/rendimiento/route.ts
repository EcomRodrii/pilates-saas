import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { obtenerRendimientoInstructoras } from '@/lib/equipo/rendimiento-datos.ts';

// Fila 17 del informe estratégico: rendimiento de instructoras por
// retención, conversión y red social. Informe de solo lectura para
// PROPIETARIO/MANAGER — mismo permiso que liquidaciones/tarifas, no mide
// nada distinto por instructora (ella no ve el ranking de sus compañeras).

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver el rendimiento del equipo' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  const items = await obtenerRendimientoInstructoras(admin, sesion.studioId, new Date());
  return NextResponse.json({ items });
}
