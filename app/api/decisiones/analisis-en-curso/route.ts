import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoDelPlan } from '@/lib/decision/plan-decisiones';
import { enCursoDesde } from '@/lib/decision/analisis-en-curso';

// GET /api/decisiones/analisis-en-curso — ¿sigue en marcha el «Analizar ahora»
// de este estudio? La pantalla lo pregunta cada 5 s mientras dura (tope 90 s),
// así que va en UNA consulta: la fila del estudio (para el plan, la misma puerta
// que `bloqueoPorPlan`) con sus sesiones MANUAL abiertas de los últimos 10 min
// embebidas. GET /api/decisiones hace ocho; sondearlo cada 5 s eran ocho cada 5 s.
//
// Mismo criterio que `analisisEnCurso` de GET /api/decisiones
// (`dbAnalisisManualEnCurso`): una sesión que el análisis cerró —COMPLETADA o
// FALLIDA— ya no cuenta, y una abierta de hace más de 10 min tampoco.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await requireSupabaseAdmin()
    .from('studios')
    .select('plan, subscription_status, decision_sessions(id)')
    .eq('id', sesion.studioId)
    .eq('decision_sessions.studio_id', sesion.studioId)
    .eq('decision_sessions.disparado_por', 'MANUAL')
    .is('decision_sessions.finalizado_en', null)
    .gte('decision_sessions.iniciado_en', enCursoDesde(new Date()))
    .limit(1, { referencedTable: 'decision_sessions' })
    .maybeSingle();

  const bloqueo = bloqueoDelPlan(data, !!error);
  if (bloqueo) return NextResponse.json({ error: bloqueo.error }, { status: bloqueo.status });

  const sesiones = (data as { decision_sessions?: unknown } | null)?.decision_sessions;
  return NextResponse.json(
    { analisisEnCurso: Array.isArray(sesiones) && sesiones.length > 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
