import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { otorgarRecuperacionesSemanales } from '@/lib/recuperaciones/otorgar-semanales';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Reparte las recuperaciones de la semana cerrada. Lo dispara pg_cron los lunes
// (bucket A: barrido periódico sin estado por ítem), con el mismo secreto de
// Vault que el resto del bucket.
//
// ⚠️ SUPABASE_CRON_SECRET, NO CRON_SECRET. Son dos secretos distintos y no
// intercambiables: `CRON_SECRET` es el de los crons NATIVOS de Vercel
// (vercel.json), y `SUPABASE_CRON_SECRET` es el que guarda Vault y manda
// pg_cron. Con el equivocado la ruta responde 401 al propio cron — detectado
// disparándolo a mano, porque un 401 en un barrido semanal no se lo cuenta
// nadie a nadie.
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
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  // `secretoValido` y no `!==`: compara en tiempo constante. El endpoint es
  // sondeable desde fuera y el secreto viaja en una cabecera.
  if (!secretoValido(req.headers.get('authorization'), secret)) {
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
