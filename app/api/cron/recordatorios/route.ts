import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { enviarRecordatoriosClasesProximas } from '@/lib/supabase-data';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// P0-37: parche hasta la cola (P0-36). Da margen mientras el barrido recorre
// todas las sesiones próximas de todos los estudios en una sola invocación.
export const maxDuration = 300;

// Recordatorio pre-clase: recorre las sesiones que empiezan en las próximas 24h
// y avisa por email a cada socia confirmada. Reduce no-shows. Lo dispara Vercel
// Cron (ver vercel.json) con el CRON_SECRET como autenticación. Ejecutándose una
// vez al día a la misma hora, la ventana de 24h no se solapa entre días.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // No exigimos Resend aquí: enviarRecordatoriosClasesProximas ya hace no-op
  // (skipped) por socia si Resend no está configurado, y ahora también envía
  // por WhatsApp cuando la socia lo prefiere — no queremos que la falta de
  // Resend bloquee ese canal.
  const desde = new Date();
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  try {
    const resumen = await enviarRecordatoriosClasesProximas(desde.toISOString(), hasta.toISOString());
    return NextResponse.json({ ejecutadoEn: desde.toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'recordatorios' } });
    return errorInterno('cron/recordatorios:GET', err, 'Error al enviar los recordatorios.');
  }
}
