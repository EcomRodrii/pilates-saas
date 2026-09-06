import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { resolverDescuentoCheckout } from '@/lib/billing/descuento-checkout';
import { esSociaNueva } from '@/lib/billing/socia-nueva';
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
    /** La socia que pregunta, si la hay. Ver la nota de `esNueva`. */
    socioId?: string | null;
  } | null;
  if (!body?.studioId || !body.codigo?.trim() || !(Number(body.subtotal) > 0)) {
    return conCorsWidget(req, NextResponse.json({ ok: false, motivo: 'Falta información' }, { status: 400 }));
  }

  const { data: codigosRaw } = await admin
    .from('codigos_descuento')
    .select('*')
    .eq('studio_id', body.studioId);
  const codigos = (codigosRaw ?? []).map(r => mapCodigoDescuento(r as RowCodigosDescuento));
  // ⚠️ `esNueva` DEBE salir de la misma función que usa el cobro, o la
  // comprobación miente.
  //
  // Aquí estaba fijo a `true` porque el único llamador era "pagar y reservar
  // sin login previo", donde por definición no hay `socioId`. Con la app de la
  // alumna llamando también, ese atajo se rompía en el peor sitio: un código
  // `soloNuevas` se le confirmaba con descuento a una socia de hace dos años, y
  // el cobro —que sí calcula `esNueva` de verdad— lo ignoraba en silencio y le
  // pasaba el precio entero.
  //
  // No se acepta un booleano del cliente: se acepta el `socioId` y lo decide el
  // servidor. Y la dirección del posible engaño es la inofensiva: omitirlo solo
  // da la comprobación PERMISIVA de siempre, que el cobro corrige después; no
  // hay forma de conseguir un descuento que el cobro no fuera a aplicar.
  const resultado = resolverDescuentoCheckout(codigos, body.codigo, {
    hoyISO: new Date().toISOString(),
    subtotal: Number(body.subtotal),
    esNueva: await esSociaNueva(admin, body.studioId, body.socioId ?? null, null),
  });
  return conCorsWidget(req, NextResponse.json(resultado));
}
