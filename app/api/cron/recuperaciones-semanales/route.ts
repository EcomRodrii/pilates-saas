import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { otorgarRecuperacionesSemanales } from '@/lib/recuperaciones/otorgar-semanales';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Reparte las recuperaciones de la semana cerrada. Lo dispara pg_cron los lunes
// (bucket A: barrido periódico sin estado por ítem), con el mismo secreto de
// Vault que el resto del bucket.
//
// ⚠️ POST, no GET, y no es indiferente: pg_cron llama con `net.http_post`, así
// que una ruta que solo exporte GET responde 405 y el barrido no corre NUNCA —
// en silencio, porque nadie mira el `net._http_response` de un cron que
// «ya está puesto». Se detectó disparándolo a mano. Los crons de Vercel
// (vercel.json) sí usan GET: por eso verifactu-transmitir exporta GET y este
// no. El disparador decide el método.
//
// Es idempotente por construcción: `crear_recuperacion` dedupe por
// `origen_reserva_id`, así que volver a correrlo el mismo lunes no otorga nada
// dos veces. Por eso no hace falta registro de «semanas ya procesadas».
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const resumen = await otorgarRecuperacionesSemanales();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'recuperaciones-semanales' } });
    return errorInterno('cron/recuperaciones-semanales:GET', err, 'Error otorgando recuperaciones.');
  }
}
