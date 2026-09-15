import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { soltarReservasPlazaFijaSinCuota } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Tras cancelar, pausar, programar la baja o cambiar la cuota de una clienta
// desde el panel: suelta AL MOMENTO las clases que su plaza fija ya le había
// reservado y que ya no cubre ninguna cuota. El cron nocturno de plazas fijas
// hace lo mismo para todos los caminos (renovaciones, pagos, vencimientos); esto
// es para no esperar a la noche con una clase mañana.
//
// Qué se suelta lo decide la base de datos (`reservas_plaza_fija_sin_cuota`), así
// que llamarla de más no cancela nada que tenga cuota. Cancelar reservas con
// service_role exige el mismo permiso que la RLS de `reservas`
// (`puedeGestionarCalendario`). El estudio sale de la sesión, nunca del body.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'plazas-fijas-sin-cuota', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para cancelar reservas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { socioId?: unknown } | null;
  const socioId = typeof body?.socioId === 'string' ? body.socioId : '';
  if (!socioId) return NextResponse.json({ error: 'Falta la clienta' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const r = await soltarReservasPlazaFijaSinCuota(admin, { studioId: sesion.studioId, socioId });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('plazas-fijas/soltar-sin-cuota:POST', err, 'No se han podido soltar las clases de su plaza fija.');
  }
}
