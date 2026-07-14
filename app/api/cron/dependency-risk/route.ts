import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
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
    const ahora = new Date().toISOString();

    // Una notificación por instructor que ACABA de pasar a ALTO.
    const notificaciones = resultados.flatMap(({ studioId, transiciones }) =>
      transiciones.map(t => ({
        id: `noti-dep-${studioId}-${t.instructorId}-${Date.now()}`,
        studio_id: studioId,
        titulo: 'Riesgo de concentración alto',
        texto: `${t.nombre || 'Un instructor'} concentra el ${t.porcentaje}% de tu facturación en alumnas cautivas. Si se va, ese ingreso está en riesgo.`,
        leida: false,
        tipo: 'AVISO',
        enlace: '/dashboard',
        creada_en: ahora,
      })),
    );

    if (notificaciones.length > 0) {
      const { error } = await admin.from('notificaciones').insert(notificaciones);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      estudios: resultados.length,
      alertasCreadas: notificaciones.length,
    });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
