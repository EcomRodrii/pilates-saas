import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { aceptarOfertaListaEspera, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Fase 2b: la socia acepta su oferta de plaza de lista de espera, desde el
// portal (sesión iniciada, decisión de producto: sin enlace mágico). Mismo
// criterio de seguridad que app/api/public/reserva/route.ts: el socioId se
// resuelve del JWT verificado vía socioAutenticado(), NUNCA del body — si se
// confiara en un socioId mandado por el cliente, un body manipulado podría
// intentar aceptar la oferta de OTRA socia.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'aceptar-oferta-espera', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; reservaId?: string } | null;
  if (!body?.studioId || !body?.reservaId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const r = await aceptarOfertaListaEspera({ studioId: body.studioId, reservaId: body.reservaId, socioId });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('reservas/aceptar-oferta-espera:POST', err, 'No se ha podido aceptar la plaza.');
  }
}
