import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { deshacerBatch, RE_BATCH_ID } from '@/lib/migracion/batches';

// Migración Mágica · deshacer: borra exactamente lo que creó un lote de
// migración (y nada más), en orden inverso de dependencias. Es la garantía de
// riesgo cero del flujo: si algo no cuadra, un clic y el estudio queda como
// estaba. Solo la propietaria.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'migracion-deshacer', { max: 5, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede deshacer una migración' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { batchId?: string } | null;
  const batchId = typeof body?.batchId === 'string' ? body.batchId : '';
  if (!RE_BATCH_ID.test(batchId)) {
    return NextResponse.json({ error: 'Identificador de lote no válido' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const r = await deshacerBatch(admin, { studioId: sesion.studioId, batchId });
    if (!r.ok) return NextResponse.json({ error: r.error, borrados: r.borrados }, { status: 409 });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('migracion/deshacer:POST', err, 'No se ha podido deshacer la migración. Vuelve a intentarlo.');
  }
}
