import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { calcularDependenciaTodosLosEstudios, evaluarRetencionTrasBajas, CONCURRENCIA_ESTUDIOS } from '@/lib/instructor-dependency';
import { mapLimit } from '@/lib/concurrency';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Cron SEMANAL (ver vercel.json): recalcula el riesgo de concentración por
// instructor de TODOS los estudios y crea una notificación in-app cuando un
// instructor pasa a "riesgo alto". Autenticado con CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });
  }

  try {
    const resultados = await calcularDependenciaTodosLosEstudios(admin);
    const mes = new Date().toISOString().slice(0, 7);

    // Migrado al Notification Engine: se publica un evento por instructor que
    // ACABA de pasar a ALTO → la dueña lo recibe en su centro. Idempotente por
    // dedupKey (instructor + mes) para no repetir el mismo aviso.
    const { publish } = await import('@/lib/notifications/engine');
    const { EVENTOS } = await import('@/lib/notifications/catalog');

    // En paralelo acotado, igual que el cálculo de arriba y por el mismo motivo:
    // esto era un doble `for` con un `await` por transición y otro por estudio,
    // dentro de una función con techo de 300 s. La idempotencia la sigue dando
    // el `dedupKey` (instructor + mes), que no depende del orden, así que
    // paralelizar no puede duplicar ningún aviso.
    const alertasPorEstudio = await mapLimit(resultados, CONCURRENCIA_ESTUDIOS, async ({ studioId, transiciones }) => {
      let n = 0;
      for (const t of transiciones) {
        try {
          await publish({
            type: EVENTOS.RIESGO_DEPENDENCIA, studioId,
            data: { instructora: t.nombre || 'Un instructor', porcentaje: t.porcentaje, instructorId: t.instructorId },
            resource: { type: 'instructor', id: t.instructorId },
            dedupKey: `riesgo-dep:${t.instructorId}:${mes}`,
          });
          n++;
        } catch (e) {
          // Un aviso que no sale no puede tumbar los de los demás estudios, pero
          // tampoco desaparecer: `mapLimit` exige que la tarea no lance.
          Sentry.captureException(e, { tags: { cron: 'dependency-risk' }, extra: { studioId, instructorId: t.instructorId } });
        }
      }
      // Fila 18: mismo cron semanal, evalúa retención de las bajas con
      // cartera congelada que ya llevan las 6 semanas de margen.
      await evaluarRetencionTrasBajas(admin, studioId).catch(e => Sentry.captureException(e));
      return n;
    });
    const alertas = alertasPorEstudio.reduce((a, b) => a + b, 0);

    return NextResponse.json({ ok: true, estudios: resultados.length, alertasCreadas: alertas });
  } catch (e) {
    Sentry.captureException(e);
    return errorInterno('cron:dependency-risk', e,
      'No se ha podido ejecutar el cálculo de riesgo por instructora.');
  }
}
