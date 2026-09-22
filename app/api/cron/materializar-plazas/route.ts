import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { materializarPlazasFijas } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { secretoValido } from '@/lib/salud/secreto';

export const dynamic = 'force-dynamic';

// Margen para materializar todas las plazas fijas de todos los estudios en una
// sola invocación.
export const maxDuration = 300;

// Materializa las plazas fijas en reservas de los próximos ~6 meses (180 días). Lo dispara
// Vercel Cron (ver vercel.json) con el CRON_SECRET como autenticación.
// Idempotente: no duplica reservas ya existentes, así que re-ejecutarlo es seguro.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  // Comparación en tiempo constante (auditoría 2026-09-21): estos cuatro
  // crons de Vercel eran los únicos que comparaban el secreto con `!==`.
  // Los 17 de pg_cron ya usaban `secretoValido`, que existe justamente
  // porque `!==` filtra por temporización cuántos caracteres se acertaron.
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const now = new Date();
  try {
    const resumen = await materializarPlazasFijas();
    return NextResponse.json({ ejecutadoEn: now.toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'materializar-plazas' } });
    return errorInterno('cron/materializar-plazas:GET', err, 'Error materializando plazas fijas.');
  }
}
