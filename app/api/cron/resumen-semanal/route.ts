import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { enviarResumenesSemanalesDeTodos } from '@/lib/decision/resumen-semanal-cron';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Piloto (2026-08-11): reemplaza lib/inngest/resumen-semanal.ts
// (dispatcher+estudio). Disparado por Postgres (pg_cron + pg_net, ver
// migración), lunes a las 09:15 UTC. Autenticado con SUPABASE_CRON_SECRET
// (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await enviarResumenesSemanalesDeTodos();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'resumen-semanal' } });
    return errorInterno('cron/resumen-semanal:POST', err, 'Error enviando resúmenes semanales del Umbral.');
  }
}
