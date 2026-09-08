import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { contextoCobroDe, proveedorPara, MAX_CENTIMOS_POS } from '@/lib/pos/terminal';
import { esReciboCobrable } from '@/lib/billing/deuda-recibo';
import type { EstadoPagoPOS } from '@/lib/pos/tipos';
import type { MetodoPago } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// «Vengo a pagar la cuota» — con tarjeta.
//
// En efectivo ya se podía (fase 3). Con tarjeta había que salir a /cobros y
// marcarlo a mano, que es EXACTAMENTE la transacción dada por buena sin que
// ningún proveedor la confirme que este rediseño existe para impedir.
//
// El flujo es el mismo que el de una venta del TPV, y a propósito:
//   POST /api/pos/recibo            → arranca el cobro, devuelve la referencia
//   POST /api/pos/recibo/confirmar  → PREGUNTA al proveedor y, solo si dice que
//                                     sí, cierra el recibo
//
// El cierre NO se reimplementa: lo hace `confirmarCobroRecibo`, el punto único
// que ya comparten el webhook de Checkout y el conciliador. Este flujo entra
// como una fuente más (`fuente: 'tpv'`), no como un camino paralelo — que es
// justo el patrón de «gemelos divergentes» que ese módulo existe para cerrar.
//
// El importe se calcula AQUÍ, del recibo de la base. Nunca llega del navegador.
// ─────────────────────────────────────────────────────────────────────────────

const COBRABLES_EN_MOSTRADOR: MetodoPago[] = ['DATAFONO', 'BIZUM'];

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { reciboId?: unknown; metodo?: unknown } | null;
  const reciboId = typeof body?.reciboId === 'string' ? body.reciboId : '';
  const metodo = String(body?.metodo ?? '') as MetodoPago;
  if (!reciboId) return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });

  // Solo métodos que confirma un TERCERO. El efectivo no pasa por aquí: lo
  // cierra `marcarCobrado` y lo apunta en caja `apuntar_cobro_en_caja`. Meterlo
  // en este flujo sería fingir una confirmación que nadie da.
  if (!COBRABLES_EN_MOSTRADOR.includes(metodo)) {
    return NextResponse.json(
      { error: 'Por aquí solo se cobra con datáfono o Bizum. El efectivo se marca en el ticket.' },
      { status: 400 },
    );
  }

  const { data: recibo } = await admin.from('recibos')
    .select('id, concepto, importe, estado, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, cobro_mostrador_pi')
    .eq('id', reciboId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!recibo) return NextResponse.json({ error: 'No encontramos ese recibo' }, { status: 404 });

  // El MISMO veredicto que usa /api/stripe/checkout y el panel. Una cuarta
  // lista de estados «cobrables» es cómo se acaba cobrando dos veces algo ya
  // devuelto.
  if (!esReciboCobrable(recibo)) {
    return NextResponse.json({ error: 'Ese recibo ya no se puede cobrar.' }, { status: 409 });
  }

  const centimos = Math.round(Number(recibo.importe) * 100);
  if (!Number.isInteger(centimos) || centimos <= 0 || centimos > MAX_CENTIMOS_POS) {
    return NextResponse.json({ error: 'Ese importe no se puede cobrar por aquí.' }, { status: 400 });
  }

  const ctx = await contextoCobroDe(admin, sesion.studioId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.motivo }, { status: 409 });

  const prov = proveedorPara(metodo, { readerId: ctx.readerId, origen: req.nextUrl.origin });

  try {
    const inicio = await prov.iniciar(ctx.ctx, {
      importeCentimos: centimos,
      concepto: recibo.concepto?.slice(0, 120) || 'Cuota',
      ref: { reciboId },
    });
    if (!inicio.ok) return NextResponse.json({ error: inicio.error }, { status: 409 });

    // Se guarda el intento EN VUELO para poder volver a preguntar tras una
    // recarga del navegador. No va en `stripe_payment_intent_id`: esa es la del
    // cargo bueno, y de ella cuelgan los reembolsos.
    const { error: errRef } = await admin.from('recibos')
      .update({
        cobro_mostrador_pi: inicio.referencia,
        // P-1 (27ª pasada): solo Bizum la rellena — hace falta para poder
        // expirar la Checkout Session de verdad al cancelar, en vez de solo
        // el PaymentIntent (que no invalida el enlace de pago).
        cobro_mostrador_checkout_session_id: inicio.checkoutSessionId ?? null,
      })
      .eq('id', reciboId).eq('studio_id', sesion.studioId);
    if (errRef) {
      // El cobro ya está lanzado en Stripe; perder la referencia solo significa
      // que el mostrador no podrá preguntar — el webhook lo cerrará igual.
      console.error('[pos/recibo] no se pudo guardar la referencia del cobro', errRef);
    }

    return NextResponse.json({
      reciboId,
      referencia: inicio.referencia,
      url: inicio.url ?? null,
      pagoEstado: inicio.estado as EstadoPagoPOS,
      importe: Number(recibo.importe),
    });
  } catch (e) {
    return errorInterno('[pos/recibo] excepción al iniciar', e, 'No se ha podido iniciar el cobro.');
  }
}
