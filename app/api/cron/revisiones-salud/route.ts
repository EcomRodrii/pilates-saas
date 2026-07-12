import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { generarRecordatoriosRevision } from '@/lib/supabase-data';

export const dynamic = 'force-dynamic';

// Margen para recorrer las condiciones activas de todos los estudios en una sola
// invocación (patrón P0-37).
export const maxDuration = 300;

// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10): crea un
// aviso en `notificaciones` por cada condición activa con revisión vencida o sin
// revisar hace demasiado tiempo. Solo notificación in-app — no necesita Resend.
// Lo dispara Vercel Cron (ver vercel.json) con el CRON_SECRET. Idempotente por
// día gracias al dedup de 30 días en generarRecordatoriosRevision.
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
    const resumen = await generarRecordatoriosRevision(now.toISOString());
    return NextResponse.json({ ejecutadoEn: now.toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'revisiones-salud' } });
    const mensaje = err instanceof Error ? err.message : 'Error al generar recordatorios de revisión';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
