import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerTrialAvisos } from '@/lib/notificaciones/trial-avisos-cron';
import { avanzarCicloEstudiosVencidos } from '@/lib/retencion/avanzar-ciclo-estudios-vencidos';
import { errorInterno } from '@/lib/errores-servidor';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { barrerAlertasApertura } from '@/lib/opening/alertas-cron';
import { revisarAppsSinPlan } from '@/lib/app-nativa/apps-sin-plan-cron';
import { registrarSituacionDiaria } from '@/lib/retencion/situacion-diaria';

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
// Y, por lo mismo, las alertas de Opening OS (lib/opening/alertas-cron.ts) y el margen de 30 días
// de la app de la App Store de quien deja de pagar Estudio/Cadena (lib/app-nativa/apps-sin-plan.ts).
// Y el informe diario de bajas en seco (lib/retencion/situacion-diaria.ts), solo con
// BAJAS_AUTOMATICAS=informe: escribe una fila por estudio y día, nada más.
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

  let alertasApertura: unknown;
  try {
    alertasApertura = await barrerAlertasApertura(requireSupabaseAdmin());
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial', area: 'opening' } });
    alertasApertura = { error: 'Error revisando las alertas de apertura.' };
  }

  let appsSinPlan: unknown;
  try {
    appsSinPlan = await revisarAppsSinPlan(requireSupabaseAdmin());
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial', area: 'apps-sin-plan' } });
    appsSinPlan = { error: 'Error revisando las apps de estudio sin plan.' };
  }

  let situacionDiaria: unknown;
  try {
    situacionDiaria = await registrarSituacionDiaria(requireSupabaseAdmin());
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial', area: 'retencion' } });
    situacionDiaria = { error: 'Error escribiendo el informe diario de bajas.' };
  }

  try {
    const resumen = await barrerTrialAvisos();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen, cicloEstudiosVencidos, alertasApertura, appsSinPlan, situacionDiaria });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-trial' } });
    return errorInterno('cron/notif-trial:POST', err, 'Error avisando de prueba gratuita a punto de acabar.');
  }
}
