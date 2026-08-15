import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { aceptarOfertaListaEspera, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Fase 5 (Booking Engine — widget): equivalente CORS-aware de
// app/api/reservas/aceptar-oferta-espera/route.ts, para el Modo B (bundle
// embebido, sin cookies de portal). Mismo criterio de seguridad: el socioId
// se resuelve del JWT verificado, nunca del body.
//
// CORS: el bundle manda ?studioId= en la URL además del body, para que el
// preflight resuelva la lista blanca sin leer el body.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-aceptar-oferta-espera', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; reservaId?: string } | null;
  if (!body?.studioId || !body?.reservaId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Faltan datos' }, { status: 400 }));
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));

  try {
    const r = await aceptarOfertaListaEspera({ studioId: body.studioId, reservaId: body.reservaId, socioId });
    if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error }, { status: 400 }));
    return conCorsWidget(req, NextResponse.json(r));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/aceptar-oferta-espera:POST', err, 'No se ha podido aceptar la plaza.'));
  }
}
