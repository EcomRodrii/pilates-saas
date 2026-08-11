import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerClientasInactivas } from '@/lib/notificaciones/bonos-inactivas-cron';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Piloto (2026-08-11): reemplaza notifInactivasDispatcher de lib/inngest/
// notif-automations.ts. Disparado por Postgres (pg_cron + pg_net, ver
// migración), lunes a las 10:00 UTC. Autenticado con SUPABASE_CRON_SECRET
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
    const resumen = await barrerClientasInactivas();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-inactivas' } });
    return errorInterno('cron/notif-inactivas:POST', err, 'Error avisando de clientas inactivas.');
  }
}
