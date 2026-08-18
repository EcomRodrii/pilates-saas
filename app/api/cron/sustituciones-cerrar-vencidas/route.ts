import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { cerrarSustitucionesVencidas } from '@/lib/sustituciones/cerrar-vencidas';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Barrido periódico sin estado por ítem ni espera durable (bucket A, mismo
// patrón que lista-espera-ofertas-expirar): lo dispara Postgres directamente
// (pg_cron + pg_net, ver la migración), sin pasar por Inngest ni por el
// límite de Vercel Cron (Hobby: solo crons diarios). Autenticado con
// SUPABASE_CRON_SECRET — reutiliza el mismo secreto de Vault que el resto de
// crons de este bucket, no el CRON_SECRET de los crons nativos de Vercel.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await cerrarSustitucionesVencidas();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'sustituciones-cerrar-vencidas' } });
    return errorInterno('cron/sustituciones-cerrar-vencidas:POST', err, 'Error cerrando sustituciones vencidas.');
  }
}
