import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sincronizarHorarioUsc } from '@/lib/plataformas/usc/horario-servidor';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Publica en Urban Sports Club las clases de las próximas dos semanas de los
// estudios conectados por API (lib/plataformas/usc/horario-servidor.ts).
// Pensado para pg_cron + pg_net cada 15 min, mismo patrón que zoom-sync.
// ⚠️ El cron NO está programado: sin USC_CLIENT_ID/USC_CLIENT_SECRET esto no
// hace nada, y cada tic gasta una invocación de Vercel. Se programa el día que
// USC dé las credenciales (docs/integraciones/urban-sports-club.md).
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
    const resumen = await sincronizarHorarioUsc(admin);
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'usc-horario' } });
    return errorInterno('cron/usc-horario:POST', err, 'Error publicando el horario en Urban Sports Club.');
  }
}
