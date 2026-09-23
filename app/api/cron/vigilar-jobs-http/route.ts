import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// AUT-10 (auditoría 23-sep): `cron.job_run_details.status = 'succeeded'` solo
// dice que `net.http_post` encoló la petición — el resultado HTTP real vive
// en `net._http_response`, que nadie consultaba. `public.vigilar_jobs_http()`
// (pg_cron, cada 15 min) mira esa tabla y solo llama aquí cuando encuentra
// algo fuera de 2xx, con timeout, o con error_msg en los últimos 20 min.
//
// No dice QUÉ job falló — `net._http_response` no guarda esa relación, y
// cambiarlo exige tocar los 19 crons existentes (ver comentario de la
// migración). Lo que sí dice es que algo en la infraestructura de crons ha
// dejado de responder bien, que es justo el silencio que esto existe para
// romper.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const cuerpo = await req.json().catch(() => null) as { fallos?: number; muestra?: unknown[] } | null;
    const fallos = cuerpo?.fallos ?? 0;
    Sentry.captureMessage('[vigilar-jobs-http] net._http_response tiene respuestas fuera de 2xx en los últimos 20 min', {
      level: 'error',
      tags: { cron: 'vigilar-jobs-http' },
      extra: { fallos, muestra: cuerpo?.muestra ?? [] },
    });
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), fallos });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'vigilar-jobs-http' } });
    return errorInterno('cron/vigilar-jobs-http:POST', err, 'Error procesando el aviso de vigilancia.');
  }
}
