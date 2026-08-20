import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { barrerEntregasPendientes } from '@/lib/notifications/process';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// C-5 (auditoría 19-ago): barre entregas de canal externo (PUSH/EMAIL/
// WHATSAPP/SMS) que quedaron en PENDING sin que nadie las intentara — el
// salto síncrono de engine.ts falló antes de ejecutar nada (timeout, 500,
// arranque en frío). Disparado por Postgres (pg_cron + pg_net, ver
// migración), cada 10 min. Autenticado con SUPABASE_CRON_SECRET (Vault),
// mismo patrón que el resto del bucket A.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });
  try {
    const resumen = await barrerEntregasPendientes(admin);
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-entregas-pendientes' } });
    return errorInterno('cron/notif-entregas-pendientes:POST', err, 'Error barriendo entregas de notificación pendientes.');
  }
}
