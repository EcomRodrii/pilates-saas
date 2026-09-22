import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { repararBonosSinDecidir } from '@/lib/reservas/reparar-bono-sin-decidir';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// D-5 (auditoría 22-sep): reconciliación del descuento de bono cuando queda
// tragado por el BEGIN/EXCEPTION defensivo de `reservar_plaza` (D-1) — ver
// lib/reservas/reparar-bono-sin-decidir.ts. Disparado por Postgres (pg_cron
// + pg_net, ver migración), cada 15 min. Autenticado con
// SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await repararBonosSinDecidir();
    if (resumen.siguenSinDecidir.length > 0) {
      // No es un error de programación: es dinero sin decidir que el reintento
      // automático no pudo cerrar (p.ej. la suscripción de la socia se borró
      // entre medias). Queda para revisión manual, y por eso avisa aunque el
      // cron en sí termine sin excepción.
      Sentry.captureMessage('[reparar-bono-sin-decidir] reservas que siguen sin decisión tras el reintento', {
        level: 'error',
        tags: { cron: 'reparar-bono-sin-decidir' },
        extra: { ids: resumen.siguenSinDecidir },
      });
    }
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'reparar-bono-sin-decidir' } });
    return errorInterno('cron/reparar-bono-sin-decidir:POST', err, 'Error reparando reservas con bono sin decidir.');
  }
}
