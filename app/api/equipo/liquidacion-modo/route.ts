import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { modoLiquidacionEstudio } from '@/lib/equipo/liquidacion-datos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Con qué calcula el estudio la parte variable de las liquidaciones: horas de
// clase (por defecto) u horas fichadas. Lo ve quien gestiona el equipo; lo cambia
// SOLO la propietaria, porque decide lo que cobra cada instructora. Afecta a los
// borradores que se generen después: una liquidación confirmada o pagada no se
// recalcula nunca (`generarLiquidacionBorrador` solo toca borradores).

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    return NextResponse.json({ modo: await modoLiquidacionEstudio(admin, sesion.studioId), puedeCambiar: sesion.rol === 'PROPIETARIO' });
  } catch (err) {
    return errorInterno('equipo/liquidacion-modo:GET', err, 'No se ha podido leer el criterio de liquidación.');
  }
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'equipo-liquidacion-modo', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede cambiar cómo se liquida' }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { modo?: unknown } | null;
  if (body?.modo !== 'CLASES' && body?.modo !== 'HORAS_FICHADAS') {
    return NextResponse.json({ error: 'Criterio no válido' }, { status: 400 });
  }
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const { error } = await admin.from('studio_config_tiempo').upsert(
      { studio_id: sesion.studioId, liquidar_por: body.modo, updated_at: new Date().toISOString() },
      { onConflict: 'studio_id' },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, modo: body.modo });
  } catch (err) {
    return errorInterno('equipo/liquidacion-modo:PUT', err, 'No se ha podido guardar el criterio.');
  }
}
