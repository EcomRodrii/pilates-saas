import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { listarBatchesRecientes } from '@/lib/migracion/batches';

// Migración Mágica · recientes: los lotes que aún se pueden deshacer, para que
// el botón de deshacer sobreviva a una recarga (el id del lote deja de vivir
// solo en la memoria del navegador). Solo la propietaria — es quien puede
// deshacer, mismo criterio que /api/migracion/deshacer.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'migracion-recientes', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede ver las migraciones' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const batches = await listarBatchesRecientes(admin, { studioId: sesion.studioId });
    return NextResponse.json({ batches });
  } catch (err) {
    return errorInterno('migracion/recientes:GET', err, 'No se han podido cargar las migraciones recientes.');
  }
}
