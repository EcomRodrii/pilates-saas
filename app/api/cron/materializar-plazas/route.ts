import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { materializarPlazasFijas } from '@/lib/supabase-data';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Margen para materializar todas las plazas fijas de todos los estudios en una
// sola invocación.
export const maxDuration = 300;

// Materializa las plazas fijas en reservas de las próximas 6 semanas. Lo dispara
// Vercel Cron (ver vercel.json) con el CRON_SECRET como autenticación.
// Idempotente: no duplica reservas ya existentes, así que re-ejecutarlo es seguro.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
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
