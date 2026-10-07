import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sincronizarWellhub } from '@/lib/plataformas/wellhub/horario-servidor';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Wellhub: primero rehace lo que los webhooks dejaron a medias (confirmar
// reservas, aplicar cancelaciones, validar check-ins) y después publica las
// clases de las próximas dos semanas (lib/plataformas/wellhub/horario-servidor.ts).
// Pensado para pg_cron + pg_net cada 15 min, mismo patrón que usc-horario.
// ⚠️ El cron NO está programado: sin WELLHUB_API_TOKEN/WELLHUB_WEBHOOK_SECRET
// esto no hace nada, y cada tic gasta una invocación de Vercel. Se programa el
// día que Wellhub dé las credenciales (docs/integraciones/wellhub.md).
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
    const resumen = await sincronizarWellhub(admin);
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'wellhub-horario' } });
    return errorInterno('cron/wellhub-horario:POST', err, 'Error sincronizando Wellhub.');
  }
}
