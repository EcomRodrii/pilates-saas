import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerBonosPorCaducar } from '@/lib/notificaciones/bonos-inactivas-cron';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { avisoParaSentry, DEFINICIONES, ID_ASISTENCIAS_SIN_PREMIO } from '@/lib/salud/comprobaciones';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// De paso (sin cron nuevo), la alarma de la fidelidad: asistencias que debieron dar
// créditos y no los dieron. Nadie sondea /api/health/flujos, así que si no se cuenta
// aquí no avisa a nadie. A Sentry solo va el número, nunca filas ni ids. Va después del
// barrido y aparte: que no se pueda contar no cambia la respuesta del cron de bonos.
async function vigilarAsistenciasSinPremio() {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    const def = DEFINICIONES.find((d) => d.id === ID_ASISTENCIAS_SIN_PREMIO);
    if (!def) return;
    const aviso = avisoParaSentry(def, await def.contar(admin, new Date()));
    if (aviso) {
      Sentry.captureMessage(aviso.mensaje, { level: aviso.nivel, tags: { area: 'fidelidad', tipo: 'salud' }, extra: aviso.extra });
    }
  } catch (e) {
    console.error('[fidelidad] vigilancia', e instanceof Error ? e.message : e);
  }
}

// Piloto (2026-08-11): reemplaza notifBonosDispatcher de lib/inngest/notif-
// automations.ts. Disparado por Postgres (pg_cron + pg_net, ver migración),
// diario a las 09:00 UTC. Autenticado con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerBonosPorCaducar();
    await vigilarAsistenciasSinPremio();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-bonos' } });
    return errorInterno('cron/notif-bonos:POST', err, 'Error avisando de bonos a punto de caducar.');
  }
}
