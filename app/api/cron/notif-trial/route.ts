import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerTrialAvisos } from '@/lib/notificaciones/trial-avisos-cron';
import { avanzarCicloEstudiosVencidos } from '@/lib/retencion/avanzar-ciclo-estudios-vencidos';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
// El ciclo de estudios vencidos puede, en modo activo, borrar Storage y R2 de
// un estudio en la misma pasada: margen por encima del minuto de antes.
export const maxDuration = 120;

// Disparado por Postgres (pg_cron + pg_net, ver migración), cada hora.
// Autenticado con SUPABASE_CRON_SECRET (Vault) — mismo patrón que notif-bonos.
//
// Además de los avisos de prueba, avanza el ciclo de estudios que vencieron sin
// pagar (lib/retencion/avanzar-ciclo-estudios-vencidos.ts): mismo público y
// misma cadencia, sin crear un job de pg_cron ni un cron de Inngest nuevos.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Independiente del barrido de avisos: que uno falle no deja sin correr al otro.
  let cicloEstudiosVencidos: unknown;
  try {
    cicloEstudiosVencidos = await avanzarCicloEstudiosVencidos();
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial', area: 'retencion' } });
    cicloEstudiosVencidos = { error: 'Error avanzando el ciclo de estudios vencidos.' };
  }

  try {
    const resumen = await barrerTrialAvisos();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen, cicloEstudiosVencidos });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial' } });
    return errorInterno('cron/notif-trial:POST', err, 'Error avisando de prueba gratuita a punto de acabar.');
  }
}
