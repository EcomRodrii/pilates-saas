import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { enviarRecordatoriosClasesProximas } from '@/lib/supabase-data';

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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return NextResponse.json({ error: 'Resend no configurado' }, { status: 503 });
  }

  const desde = new Date();
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  try {
    const resumen = await enviarRecordatoriosClasesProximas(desde.toISOString(), hasta.toISOString());
    return NextResponse.json({ ejecutadoEn: desde.toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'recordatorios' } });
    const mensaje = err instanceof Error ? err.message : 'Error al enviar recordatorios';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
