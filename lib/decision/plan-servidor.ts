import { NextResponse } from 'next/server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoDelPlan } from './plan-decisiones.ts';

// La puerta del plan de las rutas del Centro de Control (plan-decisiones.ts):
// `null` si el plan del estudio lo incluye; si no, la respuesta que hay que
// devolver tal cual. Va justo después de comprobar el rol, antes de leer nada.
export async function bloqueoPorPlan(studioId: string): Promise<NextResponse | null> {
  const { data, error } = await requireSupabaseAdmin()
    .from('studios').select('plan, subscription_status').eq('id', studioId).maybeSingle();
  const bloqueo = bloqueoDelPlan(data, !!error);
  return bloqueo ? NextResponse.json({ error: bloqueo.error }, { status: bloqueo.status }) : null;
}
