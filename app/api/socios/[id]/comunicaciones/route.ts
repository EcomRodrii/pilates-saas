import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { dbListComunicacionesSocio } from '@/lib/db/supabase-data-admin';

// Historial real de emails enviados a una socia (ver comunicaciones_socio,
// migr 20260803120000). Fuera del snapshot global de studio-context a
// propósito: es potencialmente mucha fila por estudio con actividad de
// campañas, así que se carga aparte, solo al entrar en la ficha de la clienta.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver las comunicaciones de esta socia' }, { status: 403 });
  }

  const { id: socioId } = await params;
  const comunicaciones = await dbListComunicacionesSocio(sesion.studioId, socioId);
  return NextResponse.json(comunicaciones);
}
