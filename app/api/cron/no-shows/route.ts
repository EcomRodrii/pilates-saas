import { NextRequest, NextResponse } from 'next/server';
import { barrerNoShows } from '@/lib/supabase-data';

export const dynamic = 'force-dynamic';

// Barrido de no-shows: pasa a NO_ASISTIO las reservas que sigan CONFIRMADA en
// clases ya terminadas. Lo dispara Vercel Cron (ver vercel.json) con el
// CRON_SECRET como autenticación. Idempotente: solo afecta a CONFIRMADA, así que
// re-ejecutarlo no cambia nada ya marcado.
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
    const resumen = await barrerNoShows(now.toISOString());
    return NextResponse.json({ ejecutadoEn: now.toISOString(), ...resumen });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error en el barrido de no-shows';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
