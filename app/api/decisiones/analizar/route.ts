import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { tieneFeature } from '@/lib/entitlements';
import { supabase } from '@/lib/supabase';
import { inngest, EVENTS } from '@/lib/inngest/client';

// POST /api/decisiones/analizar — "Ejecutar ahora" manual (equivalente al
// botón de Automatizaciones). Rate-limit: no más de un análisis cada 5
// minutos por estudio (DECISION-OS-ARQUITECTURA.md §7).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: studio } = await supabase.from('studios').select('plan, subscription_status').eq('id', sesion.studioId).single();
  if (!studio || !tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscription_status }, 'decisiones')) {
    return NextResponse.json({ error: 'Tu plan no incluye el Centro de Control' }, { status: 403 });
  }

  const cincoMinAtras = new Date(Date.now() - 5 * 60000).toISOString();
  const { data: sesionReciente } = await supabase
    .from('decision_sessions')
    .select('id')
    .eq('studio_id', sesion.studioId)
    .gte('iniciado_en', cincoMinAtras)
    .limit(1)
    .maybeSingle();
  if (sesionReciente) {
    return NextResponse.json({ error: 'Ya hay un análisis reciente en curso, espera unos minutos.' }, { status: 429 });
  }

  await inngest.send({
    name: EVENTS.DECISION_ANALYZE,
    data: { studioId: sesion.studioId, disparadoPor: 'MANUAL', nowISO: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
