import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { dbResumenPagosHistoricosPorDia } from '@/lib/db/supabase-data-admin';

// Lo importado de la plataforma anterior, agregado por día, para las líneas
// «importado de tu software anterior» de Cobros e Informes. Mismo gate que los
// recibos reales: es dinero, aunque sea histórico. NO es un recibo ni se suma al
// «Cobrado» — ver lib/cobros/pagos-historicos.ts.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver los pagos importados' }, { status: 403 });
  }
  const resumen = await dbResumenPagosHistoricosPorDia(sesion.studioId);
  if (!resumen) return NextResponse.json({ error: 'No se han podido leer los pagos importados' }, { status: 500 });
  return NextResponse.json(resumen);
}
