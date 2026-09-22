import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerClasesFijasTerminanPronto } from '@/lib/notificaciones/clase-fija-termina-cron';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Clases fijas del estudio (Fase 2): avisa a la alumna cuando le quedan pocos
// días de una clase fija (DIAS_AVISO_CLASE_FIJA_TERMINA) para que pueda
// ampliarla antes de perder el sitio. Disparado por Postgres (pg_cron +
// pg_net, ver migración), diario a las 09:00 UTC. Autenticado con
// SUPABASE_CRON_SECRET (Vault) — mismo patrón que cron/notif-bonos.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerClasesFijasTerminanPronto();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'clase-fija-termina-pronto' } });
    return errorInterno('cron/clase-fija-termina-pronto:POST', err, 'Error avisando de clases fijas que terminan pronto.');
  }
}
