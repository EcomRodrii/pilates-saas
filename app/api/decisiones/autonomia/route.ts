import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { tieneFeature } from '@/lib/billing/entitlements';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbGetAutonomiaConfig, dbSetAutonomiaConfig } from '@/lib/decision/db';
import { TIPOS_AUTONOMIA_PERMITIDOS, MAX_DIARIO_TOPE, type AutonomiaConfig } from '@/lib/decision/autonomia';

// Config del "piloto automático" del Decision OS. Solo el propietario, y solo con
// plan que incluya el Centro de Control (misma puerta que el resto de /decisiones).
async function guard(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  const { data: studio } = await requireSupabaseAdmin().from('studios').select('plan, subscription_status').eq('id', sesion.studioId).single();
  if (!studio || !tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscription_status }, 'decisiones')) {
    return { error: NextResponse.json({ error: 'Tu plan no incluye el Centro de Control' }, { status: 403 }) };
  }
  return { studioId: sesion.studioId, usuarioId: sesion.userId };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const config = await dbGetAutonomiaConfig(g.studioId);
  return NextResponse.json({ config, tiposDisponibles: TIPOS_AUTONOMIA_PERMITIDOS, maxDiarioTope: MAX_DIARIO_TOPE });
}

export async function PUT(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => null) as Partial<AutonomiaConfig> | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 });
  // dbSetAutonomiaConfig sanea el input (descarta tipos no permitidos, acota el tope)
  // y devuelve la config realmente guardada.
  const guardada = await dbSetAutonomiaConfig(g.studioId, body as AutonomiaConfig, g.usuarioId);
  return NextResponse.json({ config: guardada });
}
