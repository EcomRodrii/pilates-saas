import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { cancelarSesionesPorMinimoNoAlcanzado } from '@/lib/minimo-asistentes/cancelar-por-minimo';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Piloto (2026-08-11): reemplaza lib/inngest/minimo-asistentes.ts. Disparado
// por Postgres (pg_cron + pg_net, ver migración), cada 15 min. Autenticado
// con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await cancelarSesionesPorMinimoNoAlcanzado();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'minimo-asistentes' } });
    return errorInterno('cron/minimo-asistentes:POST', err, 'Error cancelando sesiones por mínimo no alcanzado.');
  }
}
