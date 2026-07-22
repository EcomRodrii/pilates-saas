import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { barrerNoShows } from '@/lib/supabase-data';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// P0-37: parche hasta la cola (P0-36). Margen para el barrido de no-shows sobre
// todas las clases terminadas de todos los estudios en una sola invocación.
export const maxDuration = 300;

// Barrido de no-shows: pasa a NO_ASISTIO las reservas que sigan CONFIRMADA en
// clases ya terminadas. Lo dispara Vercel Cron (ver vercel.json) con el
// CRON_SECRET como autenticación. Idempotente: solo afecta a CONFIRMADA, así que
// re-ejecutarlo no cambia nada ya marcado.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const now = new Date();
  try {
    const resumen = await barrerNoShows(now.toISOString());
    return NextResponse.json({ ejecutadoEn: now.toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'no-shows' } });
    return errorInterno('cron/no-shows:GET', err, 'Error en el barrido de no-shows.');
  }
}
