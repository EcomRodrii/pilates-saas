import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { marcarAsistidasAutomaticamente } from '@/lib/checkin/marcar-asistidas-automatico';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Piloto (2026-08-11): reemplaza lib/inngest/checkin-automatico.ts. Disparado
// por Postgres (pg_cron + pg_net, ver migración), cada 30 min. Autenticado
// con SUPABASE_CRON_SECRET (Vault) — ver app/api/cron/lista-espera-ofertas-
// expirar/route.ts para el razonamiento completo del patrón.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await marcarAsistidasAutomaticamente();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'checkin-automatico' } });
    return errorInterno('cron/checkin-automatico:POST', err, 'Error marcando asistencias automáticas.');
  }
}
