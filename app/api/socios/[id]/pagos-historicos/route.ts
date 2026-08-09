import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { dbListPagosHistoricosSocio } from '@/lib/db/supabase-data-admin';

// Pagos importados de la plataforma anterior, para la ficha de una socia
// concreta. Mismo gate que los recibos reales (puedeVerFinanzas): es dinero,
// aunque sea histórico. Fuera del snapshot global de studio-context a
// propósito — ver comentario en dbListPagosHistoricosSocio.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver los pagos de esta socia' }, { status: 403 });
  }

  const { id: socioId } = await params;
  const pagos = await dbListPagosHistoricosSocio(sesion.studioId, socioId);
  return NextResponse.json(pagos);
}
