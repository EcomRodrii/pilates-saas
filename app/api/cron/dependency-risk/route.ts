import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { calcularDependenciaTodosLosEstudios } from '@/lib/instructor-dependency';

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
    let alertas = 0;
    for (const { studioId, transiciones } of resultados) {
      for (const t of transiciones) {
        await publish({
          type: EVENTOS.RIESGO_DEPENDENCIA, studioId,
          data: { instructora: t.nombre || 'Un instructor', porcentaje: t.porcentaje, instructorId: t.instructorId },
          resource: { type: 'instructor', id: t.instructorId },
          dedupKey: `riesgo-dep:${t.instructorId}:${mes}`,
        });
        alertas++;
      }
    }

    return NextResponse.json({ ok: true, estudios: resultados.length, alertasCreadas: alertas });
  } catch (e) {
    Sentry.captureException(e);
    return errorInterno('cron:dependency-risk', e,
      'No se ha podido ejecutar el cálculo de riesgo por instructora.');
  }
}
