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
// Programado el 12-nov-2026 (migr 20261112102724). Sin WELLHUB_API_TOKEN y
// WELLHUB_WEBHOOK_SECRET no hace nada; en ese caso la respuesta dice cuáles
// faltan (solo los NOMBRES, nunca los valores) para no tener que adivinarlo
// (docs/integraciones/wellhub.md).
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
    const faltan = resumen.sinCredenciales
      ? ['WELLHUB_API_TOKEN', 'WELLHUB_WEBHOOK_SECRET'].filter(v => !process.env[v]?.trim())
      : undefined;
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen, ...(faltan && { faltan }) });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'wellhub-horario' } });
    return errorInterno('cron/wellhub-horario:POST', err, 'Error sincronizando Wellhub.');
  }
}
