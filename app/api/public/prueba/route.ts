import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { usuarioSupabaseConPaso } from '@/lib/auth-server';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { pruebaParaSocia } from '@/lib/billing/clase-prueba';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu primera clase» en la app de la alumna (P07, 6-oct-2026). SOLO LECTURA.
//
// ¿Puede ESTA socia estrenar la clase de prueba del estudio? Lo decide
// `pruebaParaSocia`, el mismo dueño que las puertas de cobro (`puedeEstrenarPrueba`):
// nunca ha comprado ni ha venido en ESTE estudio. Fail-closed: cualquier fallo es
// `{ disponible: false }` y la tarjeta no sale.
//
// La app solo pregunta si el catálogo trae una prueba activa: sin ella, 0 peticiones.
// ─────────────────────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'prueba-app', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return json({ error: 'Falta el estudio' }, 400);

  const r = await usuarioSupabaseConPaso(req);
  if (!r) return json({ error: 'No autorizado' }, 401);
  if (r.paso === 'doble_factor') return json({ error: 'Falta el segundo paso de la verificación', codigo: CODIGO_SEGUNDO_PASO }, 401);
  const socioId = await socioAutenticado(r.usuario.userId, studioId);
  if (!socioId) return json({ error: 'No autorizado' }, 403);
  const porSocia = { max: 20, windowSeconds: 60 };
  const lim = await rateLimit(`prueba-socia:${socioId}`, porSocia);
  if (!lim.allowed) return tooManyRequestsResponse(retryAfterSeconds(lim.resetAt, porSocia.windowSeconds));

  const admin = getSupabaseAdmin();
  if (!admin) return json({ disponible: false });
  try {
    const oferta = await pruebaParaSocia(admin, studioId, socioId);
    return json(oferta ? { disponible: true, oferta } : { disponible: false });
  } catch {
    return json({ disponible: false });
  }
}
