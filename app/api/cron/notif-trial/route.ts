import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerTrialAvisos } from '@/lib/notificaciones/trial-avisos-cron';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Disparado por Postgres (pg_cron + pg_net, ver migración), cada hora.
// Autenticado con SUPABASE_CRON_SECRET (Vault) — mismo patrón que notif-bonos.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerTrialAvisos();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial' } });
    return errorInterno('cron/notif-trial:POST', err, 'Error avisando de prueba gratuita a punto de acabar.');
  }
}
