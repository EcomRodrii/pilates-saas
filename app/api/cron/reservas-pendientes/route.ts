import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { expirarReservasPendientes } from '@/lib/reservas-pendientes/expirar';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Piloto (2026-08-11): reemplaza lib/inngest/reservas-pendientes.ts.
// Disparado por Postgres (pg_cron + pg_net, ver migración), cada 10 min.
// Autenticado con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await expirarReservasPendientes();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'reservas-pendientes' } });
    return errorInterno('cron/reservas-pendientes:POST', err, 'Error expirando reservas pendientes de aprobación.');
  }
}
