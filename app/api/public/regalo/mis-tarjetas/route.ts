import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { tarjetasDeSocia } from '@/lib/regalo/servidor';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Las tarjetas regalo YA canjeadas por la alumna (saldo y caducidad). Nunca devuelve el código.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-regalo-mis-tarjetas', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const t = await tarjetasDeSocia(admin, studioId, socioId);
    return NextResponse.json({
      tarjetas: t.map(x => ({ id: x.id, importeInicial: x.importe_inicial, saldo: x.saldo, caducaEn: x.caduca_en, estado: x.estado_efectivo })),
    });
  } catch (err) {
    return errorInterno('public/regalo/mis-tarjetas:GET', err, 'No hemos podido cargar tus tarjetas.');
  }
}
