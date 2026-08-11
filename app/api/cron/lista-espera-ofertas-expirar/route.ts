import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerOfertasListaEsperaExpiradas } from '@/lib/lista-espera/expirar-ofertas';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Piloto (2026-08-11): reemplaza lib/inngest/lista-espera-ofertas.ts. Lo
// dispara Postgres directamente (pg_cron + pg_net, ver la migración), cada
// 5 min, sin pasar por Inngest ni por el límite de Vercel Cron (Hobby: solo
// crons diarios). Autenticado con SUPABASE_CRON_SECRET — un secreto propio,
// no el CRON_SECRET que ya usan los crons de Vercel: la cadena de confianza
// es distinta (la firma Postgres, no Vercel), así que conviene no compartirlo.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerOfertasListaEsperaExpiradas();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'lista-espera-ofertas-expirar' } });
    return errorInterno('cron/lista-espera-ofertas-expirar:POST', err, 'Error expirando ofertas de lista de espera.');
  }
}
