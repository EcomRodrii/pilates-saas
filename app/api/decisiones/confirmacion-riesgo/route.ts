import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { tieneFeature } from '@/lib/billing/entitlements';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';

// Toggle de "pedir confirmación a socias de riesgo de plantón y liberar su
// plaza si no responden" (migración 0059). Solo el propietario, y solo con plan
// que incluya el Centro de Control — misma puerta que el resto de /decisiones.
// Apagado por defecto: es una acción real sobre una reserva de pago, el
// estudio la enciende conscientemente (mismo criterio que avisar_alumnas en
// sustituciones).
async function guard(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  const { data: studio } = await requireSupabaseAdmin().from('studios').select('plan, subscription_status').eq('id', sesion.studioId).single();
  if (!studio || !tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscription_status }, 'decisiones')) {
    return { error: NextResponse.json({ error: 'Tu plan no incluye el Centro de Control' }, { status: 403 }) };
  }
  return { studioId: sesion.studioId };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const { data } = await requireSupabaseAdmin()
    .from('studios').select('pedir_confirmacion_riesgo').eq('id', g.studioId).maybeSingle();
  return NextResponse.json({ activo: !!data?.pedir_confirmacion_riesgo });
}

export async function PUT(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const body = (await req.json().catch(() => null)) as { activo?: unknown } | null;
  if (typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'Falta "activo"' }, { status: 400 });

  const { error } = await requireSupabaseAdmin()
    .from('studios').update({ pedir_confirmacion_riesgo: body.activo }).eq('id', g.studioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activo: body.activo });
}
