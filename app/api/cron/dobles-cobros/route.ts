import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { avisarDoblesCobrosSinNotificar } from '@/lib/billing/dobles-cobros';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// PAY-5 (auditoría 24-sep): detector de dobles cobros. `public.vigilar_dobles_cobros()`
// (pg_cron, cada 30 min) detecta en SQL —recibos con más de un PaymentIntent que
// tomó dinero, sobre el libro `cobros_intentos`— y SOLO llama aquí cuando hay
// detecciones sin notificar. Autenticado con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const resumen = await avisarDoblesCobrosSinNotificar(admin, (aviso) => {
      Sentry.captureMessage('[dobles-cobros] un recibo tiene más de un cargo que tomó dinero: revisar en Stripe y devolver uno', {
        level: 'error',
        tags: { area: 'cobros', tipo: 'doble-cobro-detectado', cron: 'dobles-cobros' },
        extra: { ...aviso },
      });
    });
    // Un fallo al marcar NO es un éxito: la fila seguiría sin notificar y este
    // aviso se repetiría cada 30 min. 500 para que `vigilar_jobs_http` lo vea.
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen }, resumen.errores > 0 ? { status: 500 } : undefined);
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'dobles-cobros' } });
    return errorInterno('cron/dobles-cobros:POST', err, 'Error avisando de dobles cobros.');
  }
}
