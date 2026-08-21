import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { barrerNoShows, barrerEsperasSinPlaza } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// P0-37: parche hasta la cola (P0-36). Margen para el barrido de no-shows sobre
// todas las clases terminadas de todos los estudios en una sola invocación.
export const maxDuration = 300;

// Barrido de no-shows: pasa a NO_ASISTIO las reservas que sigan CONFIRMADA en
// clases ya terminadas. Lo dispara Vercel Cron (ver vercel.json) con el
// CRON_SECRET como autenticación. Idempotente: solo afecta a CONFIRMADA, así que
// re-ejecutarlo no cambia nada ya marcado.
//
// Cierra además las esperas PAGADAS que ya no pueden resolverse (mismo cron a
// propósito: misma ventana, misma cadencia y la misma forma de trabajo —una
// reserva atascada en un estado transitorio de una clase ya terminada—, así que
// no hace falta ni un cron nuevo de Vercel ni una entrada más de pg_cron).
// Va DESPUÉS de los no-shows y en su propio try: es el barrido secundario, y un
// fallo suyo no puede hacer que se pierdan las faltas del día.
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
    let esperas: Awaited<ReturnType<typeof barrerEsperasSinPlaza>> | { error: string };
    try {
      esperas = await barrerEsperasSinPlaza(now.toISOString());
    } catch (err) {
      Sentry.captureException(err, { tags: { cron: 'no-shows', barrido: 'esperas-sin-plaza' } });
      esperas = { error: err instanceof Error ? err.message : 'error' };
    }
    return NextResponse.json({ ejecutadoEn: now.toISOString(), ...resumen, esperas });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'no-shows' } });
    return errorInterno('cron/no-shows:GET', err, 'Error en el barrido de no-shows.');
  }
}
