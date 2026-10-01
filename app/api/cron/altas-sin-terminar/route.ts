import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarRecordatoriosAltas } from '@/lib/alta/recordatorio-servidor';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Correo a las 24 h a quien empezó el alta de su estudio y no la terminó (uno
// por persona, con el texto según el paso en que se quedó). Disparado por
// pg_cron + pg_net cada hora, y solo si hay altas pendientes (migración
// 20261001190100) — mismo patrón bucket A que zoom-sync.
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
    const resumen = await enviarRecordatoriosAltas(admin);
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'altas-sin-terminar' } });
    return errorInterno('cron/altas-sin-terminar:POST', err, 'Error enviando los recordatorios de alta.');
  }
}
