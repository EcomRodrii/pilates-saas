import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { transmitirPendientes } from '@/lib/verifactu/transmitir';
import { errorInterno } from '@/lib/errores-servidor';
import { secretoValido } from '@/lib/salud/secreto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Manda a la AEAT las facturas que están en cola. Lo dispara Vercel Cron (ver
// vercel.json) con CRON_SECRET.
//
// ⚠️ Va por cron y no dentro del sellado porque la AEAT impone control de flujo
// entre envíos (arranca en 60 s). Transmitir al cobrar dejaría el panel
// esperando en cuanto alguien cobrase dos recibos seguidos.
//
// Mientras no haya certificado configurado no hace nada y lo dice: las facturas
// se siguen numerando, encadenando y sellando con su QR, solo esperan.
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

  try {
    const resumen = await transmitirPendientes();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'verifactu-transmitir' } });
    return errorInterno('cron/verifactu-transmitir:GET', err, 'Error transmitiendo facturas a la AEAT.');
  }
}
