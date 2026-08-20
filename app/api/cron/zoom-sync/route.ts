import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sincronizarReunionesZoom } from '@/lib/zoom-sync';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Crea/actualiza/borra las reuniones de Zoom de las sesiones online de los
// próximos 14 días, para cada estudio con Zoom conectado. Disparado por
// pg_cron + pg_net (mismo patrón bucket A que notif-entregas-pendientes),
// cada 15 min — el enlace tiene que existir antes de que empiece la clase.
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
    const resumen = await sincronizarReunionesZoom(admin);
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'zoom-sync' } });
    return errorInterno('cron/zoom-sync:POST', err, 'Error sincronizando reuniones de Zoom.');
  }
}
