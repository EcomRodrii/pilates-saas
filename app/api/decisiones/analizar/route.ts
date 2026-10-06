import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorPlan } from '@/lib/decision/plan-servidor';
import { dbCerrarSesionInterrumpida, dbInsertDecisionSession, dbListSesionesRecientes } from '@/lib/decision/db';
import { motivoParaNoAnalizar, TEXTO_NO_SE_PUDO_LANZAR } from '@/lib/decision/analisis-en-curso';
import { ALGORITHM_VERSION } from '@/lib/decision/version';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { uid } from '@/lib/utils';

// POST /api/decisiones/analizar — «Analizar ahora». Rate-limit: no más de un
// análisis cada 5 minutos por estudio, y nunca dos a la vez
// (lib/decision/analisis-en-curso.ts, `motivoParaNoAnalizar`): el 429 dice cuál
// de las dos cosas pasa, porque la pantalla hace distinto en cada caso.
//
// La sesión (`decision_sessions`, MANUAL) se crea AQUÍ, antes de enviar el
// evento, y su id va en él: el análisis la reutiliza y la cierra. Así la
// pantalla puede preguntar si sigue en marcha desde el 202, sin carrera con el
// arranque del análisis (GET /api/decisiones/analisis-en-curso).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const sinPlan = await bloqueoPorPlan(sesion.studioId);
  if (sinPlan) return sinPlan;

  const ahora = new Date();
  const recientes = await dbListSesionesRecientes(sesion.studioId, ahora);
  if (recientes === undefined) {
    return NextResponse.json({ error: 'No se ha podido comprobar si ya hay un análisis en marcha. Vuelve a intentarlo.' }, { status: 500 });
  }
  const noAhora = motivoParaNoAnalizar(recientes, ahora);
  if (noAhora) return NextResponse.json(noAhora, { status: 429 });

  const nowISO = ahora.toISOString();
  let sessionId: string;
  try {
    sessionId = await dbInsertDecisionSession({
      id: uid(), studioId: sesion.studioId, disparadoPor: 'MANUAL', algorithmVersion: ALGORITHM_VERSION, iniciadoEn: nowISO,
    });
  } catch {
    return NextResponse.json({ error: TEXTO_NO_SE_PUDO_LANZAR }, { status: 500 });
  }

  try {
    await inngest.send({
      name: EVENTS.DECISION_ANALYZE,
      data: { studioId: sesion.studioId, disparadoPor: 'MANUAL', nowISO, sessionId },
    });
  } catch {
    // Sin evento no hay análisis: la sesión se cierra para que la pantalla no
    // se quede «analizando» y para que el próximo intento no choque con ella.
    await dbCerrarSesionInterrumpida(sesion.studioId, { id: sessionId }, 'No se pudo enviar el evento del análisis').catch(() => {});
    return NextResponse.json({ error: TEXTO_NO_SE_PUDO_LANZAR }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sessionId }, { status: 202 });
}
