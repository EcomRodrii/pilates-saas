import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarCorreosEmpuje, enviarCorreosPrimeraClase, enviarRecordatoriosAltas } from '@/lib/alta/recordatorio-servidor';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Correo a las 24 h a quien empezó el alta de su estudio y no la terminó (uno
// por persona, con el texto según el paso en que se quedó). Disparado por
// pg_cron + pg_net cada hora, y solo si hay altas pendientes (migración
// 20261001195953) — mismo patrón bucket A que zoom-sync.
//
// Y, desde el PR-5 del alta nueva, «Tu primera clase en Tentare, en 5 minutos»
// a quien creó su estudio con el alta nueva hace 24-72 h y todavía no tiene
// una clase que una alumna nueva pueda reservar (la guarda del job llama
// también entonces: migración 20261021160000). Cada parte, con su propio
// tropiezo: si una falla, la otra sale igual.
//
// Y, desde el 31-oct, los dos correos de «después de la primera clase» («falta
// que lo sepan tus alumnas» y «ya compartiste tu enlace»), apagados de serie:
// solo con ALTA_EMPUJE=on (lib/alta/correo-empuje.ts).
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
  const [altas, primeraClase, empuje] = await Promise.allSettled([
    enviarRecordatoriosAltas(admin), enviarCorreosPrimeraClase(admin), enviarCorreosEmpuje(admin),
  ]);
  if (empuje.status === 'rejected') {
    Sentry.captureException(empuje.reason, { tags: { cron: 'altas-sin-terminar', parte: 'empuje' } });
  }
  if (primeraClase.status === 'rejected') {
    Sentry.captureException(primeraClase.reason, { tags: { cron: 'altas-sin-terminar', parte: 'primera-clase' } });
  }
  if (altas.status === 'rejected') {
    Sentry.captureException(altas.reason, { tags: { cron: 'altas-sin-terminar' } });
    return errorInterno('cron/altas-sin-terminar:POST', altas.reason, 'Error enviando los recordatorios de alta.');
  }
  return NextResponse.json({
    ejecutadoEn: new Date().toISOString(),
    ...altas.value,
    primeraClase: primeraClase.status === 'fulfilled' ? primeraClase.value : null,
    empuje: empuje.status === 'fulfilled' ? empuje.value : null,
  });
}
