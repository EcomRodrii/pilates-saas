import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { ejecutarCopiaDiariaDeTodos } from '@/lib/backups/ejecutar-copia-diaria';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
// Recorre todos los estudios en una sola invocación (fan-out colapsado) —
// margen amplio, mismo criterio que app/api/cron/materializar-plazas.
export const maxDuration = 300;

// Piloto (2026-08-11): reemplaza lib/inngest/backups.ts (dispatcher+estudio).
// Disparado por Postgres (pg_cron + pg_net, ver migración), diario a las
// 03:00 UTC. Autenticado con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await ejecutarCopiaDiariaDeTodos();
    // ⚠️ Con `fallidos > 0` esto devolvía 200. Es el ÚNICO cron sin red —corre
    // una vez al día y no reintenta—, así que un estudio podía encadenar noches
    // sin copia sin que nada lo dijera: pasó de verdad (studio-1, sin backup
    // diario desde el 2026-09-09, tres noches). Un 5xx deja rastro en pg_net y
    // en cualquier monitor de la ruta, que es lo que faltaba.
    return NextResponse.json(
      { ejecutadoEn: new Date().toISOString(), ...resumen },
      resumen.fallidos > 0 ? { status: 500 } : undefined,
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'backups' } });
    return errorInterno('cron/backups:POST', err, 'Error ejecutando la copia de seguridad diaria.');
  }
}
