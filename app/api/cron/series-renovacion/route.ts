import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerSeriesPorRenovar } from '@/lib/series/avisos-cron';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
// Puede renovar varias series seguidas (cada una, hasta 400 clases).
export const maxDuration = 120;

// Disparado por Postgres (pg_cron + pg_net, migr 20260915120000), una vez al día
// a las 7:00 UTC. Autenticado con SUPABASE_CRON_SECRET (Vault) — mismo patrón que
// notif-trial. Renueva las series con renovación automática y avisa de las que
// se acaban (lib/series/avisos-cron.ts).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const resumen = await barrerSeriesPorRenovar();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'series-renovacion' } });
    return errorInterno('cron/series-renovacion:POST', err, 'Error renovando y avisando de series que se acaban.');
  }
}
