import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { mapCodigoDescuento } from '@/lib/supabase-data';
import type { RowCodigosDescuento } from '@/lib/db-types';

// Fase 3 del rediseño de la pantalla de reserva (docs/rediseno-pantalla-reserva-diseno.md):
// da feedback en vivo al escribir un código promocional ("válido, -3 €" /
// "código no válido") sin esperar a intentar el pago — hoy `checkout-embebido`
// resuelve el mismo código, pero un código malo ahí se IGNORA en silencio
// (nunca bloquea la compra), así que la única forma de enterarse era mirar el
// importe final ya dentro del Payment Element. Envoltorio de solo lectura
// sobre `resolverDescuentoCheckout` (misma función que ya usan
// app/api/stripe/checkout y checkout-embebido) — no reimplementa la regla de
// negocio, solo la expone antes de cobrar.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  // Bucket propio y generoso: se llama en cada pulsación (con debounce en el
  // cliente), no una vez por intento de pago como checkout-embebido.
  const limited = await enforceRateLimit(req, 'validar-codigo-descuento', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return conCorsWidget(req, NextResponse.json({ ok: false, motivo: 'Servidor no configurado' }, { status: 503 }));
  }

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    codigo?: string;
    subtotal?: number;
  } | null;
  if (!body?.studioId || !body.codigo?.trim() || !(Number(body.subtotal) > 0)) {
    return conCorsWidget(req, NextResponse.json({ ok: false, motivo: 'Falta información' }, { status: 400 }));
  }

  const { data: codigosRaw } = await admin
    .from('codigos_descuento')
    .select('*')
    .eq('studio_id', body.studioId);
  const codigos = (codigosRaw ?? []).map(r => mapCodigoDescuento(r as RowCodigosDescuento));
  // `esNueva: true` — este endpoint solo lo llama la pantalla de "pagar y
  // reservar sin login previo" (docs/reserva-sin-login-diseno.md), donde por
  // definición todavía no hay `socioId`: es siempre una visitante nueva.
  const resultado = resolverDescuentoCheckout(codigos, body.codigo, {
    hoyISO: new Date().toISOString(),
    subtotal: Number(body.subtotal),
    esNueva: true,
  });
  return conCorsWidget(req, NextResponse.json(resultado));
}
