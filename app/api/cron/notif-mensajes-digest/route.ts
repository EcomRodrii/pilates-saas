import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerDigestMensajesNoLeidos } from '@/lib/mensajeria/digest';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Community & Messaging OS (P0): digest de baja frecuencia de mensajes sin
// leer (nunca un email por mensaje — ver lib/notifications/catalog.ts,
// EVENTOS.MENSAJE_DIGEST_NO_LEIDO). Disparado por pg_cron cada 3 horas,
// autenticado con SUPABASE_CRON_SECRET (Vault) — mismo patrón que
// notif-inactivas/notif-entregas-pendientes.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerDigestMensajesNoLeidos();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-mensajes-digest' } });
    return errorInterno('cron/notif-mensajes-digest:POST', err, 'Error avisando de mensajes sin leer.');
  }
}
