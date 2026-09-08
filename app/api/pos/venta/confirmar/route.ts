import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { contextoCobroDe, proveedorPara } from '@/lib/pos/terminal';
import { entregarVentaPOS } from '@/lib/pos/venta-servidor';
import type { EstadoPagoPOS } from '@/lib/pos/tipos';
import type { MetodoPago } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Ha pagado ya? Lo pregunta el TPV en bucle mientras la clienta pasa la
// tarjeta, y el SERVIDOR va a mirarlo al proveedor.
//
// Nada de lo que responde esta ruta sale de lo que diga el navegador. El TPV
// manda un id de venta; el servidor lee el PaymentIntent en Stripe y decide.
// Es la diferencia entre "el mostrador cree que ha cobrado" y "ha cobrado".
//
// ─── Idempotencia por compare-and-set ─────────────────────────────────────
// `confirmar_pago_venta_pos` solo actúa sobre una venta que siga en
// PENDIENTE_PAGO, y devuelve `r_aplicado` diciendo si fue ELLA quien la cerró.
// Esta ruta y el webhook de Stripe pueden llegar a la vez sin saber uno del
// otro: solo quien recibe `aplicado = true` entrega el bono, suma los créditos
// y sella la factura. El otro se limita a informar del estado.
//
// ─── `accion: 'cancelar'` ─────────────────────────────────────────────────
// Cancelar en el mostrador NO marca la venta como fallida por su cuenta: pide
// al proveedor que cancele y VUELVE A PREGUNTAR. Si entre el clic y la
// cancelación la tarjeta llegó a pasarse, gana lo que diga Stripe. Un botón de
// cancelar que anula una venta ya cobrada es un descuadre garantizado.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { ventaId?: unknown; accion?: unknown } | null;
  const ventaId = typeof body?.ventaId === 'string' ? body.ventaId : null;
  const accion = body?.accion === 'cancelar' ? 'cancelar' : 'consultar';
  if (!ventaId) return NextResponse.json({ error: 'Falta la venta' }, { status: 400 });

  const { data: venta } = await admin.from('ventas_pos')
    .select('id, estado, pago_estado, pago_error, total, metodo_pago, stripe_payment_intent_id, checkout_session_id, socio_id, numero')
    .eq('id', ventaId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!venta) return NextResponse.json({ error: 'No encontramos esa venta' }, { status: 404 });

  const responder = (estado: string, pagoEstado: EstadoPagoPOS, extra: Record<string, unknown> = {}) =>
    NextResponse.json({ ventaId, numero: venta.numero, estado, pagoEstado, total: Number(venta.total ?? 0), ...extra });

  // Ya cerrada por el otro camino (el webhook, o una consulta anterior).
  if (venta.estado === 'PAGADA') return responder('PAGADA', 'PAGADO');
  if (venta.estado === 'ANULADA') {
    return responder('ANULADA', (venta.pago_estado ?? 'CANCELADO') as EstadoPagoPOS, { motivo: venta.pago_error });
  }

  // Sin referencia no hay a quién preguntar. Pasa si el cobro ni llegó a
  // lanzarse; se anula para devolver el stock reservado en vez de dejar la
  // venta colgada bloqueando género.
  if (!venta.stripe_payment_intent_id) {
    await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: ventaId, p_studio_id: sesion.studioId,
      p_pago_estado: 'ERROR', p_motivo: 'El cobro no llegó a iniciarse',
    });
    return responder('ANULADA', 'ERROR', { motivo: 'El cobro no llegó a iniciarse.' });
  }

  const ctx = await contextoCobroDe(admin, sesion.studioId);
  if (!ctx.ok) {
    // No se puede PREGUNTAR. Eso no es "no pagado": la venta se queda como
    // está y el mostrador ve que seguimos sin saberlo.
    return responder('PENDIENTE_PAGO', 'PROCESANDO', { aviso: ctx.motivo });
  }

  const prov = proveedorPara(venta.metodo_pago as MetodoPago, { readerId: ctx.readerId, origen: req.nextUrl.origin });

  if (accion === 'cancelar') {
    // P-1 (27ª pasada): con Bizum, esto expira la Checkout Session de
    // verdad (no solo el PaymentIntent) — ver lib/pos/terminal.ts.
    await prov.cancelar(ctx.ctx, venta.stripe_payment_intent_id, venta.checkout_session_id);
  }

  const estadoProveedor = await prov.consultar(ctx.ctx, venta.stripe_payment_intent_id);

  if (estadoProveedor.estado === 'PAGADO') {
    const { data: conf, error } = await admin.rpc('confirmar_pago_venta_pos', {
      p_venta_id: ventaId,
      p_studio_id: sesion.studioId,
      p_payment_intent_id: venta.stripe_payment_intent_id,
      // Lo que dice el PROVEEDOR haber cobrado, no el total de la venta: pasar
      // `venta.total` comparaba el importe consigo mismo y dejaba inerte el
      // guardia `IMPORTE_NO_COINCIDE` por este camino. Si el proveedor no lo
      // sabe todavía, `null` desactiva la comprobación en vez de inventarla.
      p_importe_confirmado: estadoProveedor.importeCentimos == null
        ? null
        : estadoProveedor.importeCentimos / 100,
    });
    if (error) return errorInterno('pos:confirmar', error, 'El cobro salió bien pero no hemos podido cerrarlo. Avísanos antes de volver a cobrar.');

    const fila = Array.isArray(conf) ? conf[0] : conf;
    // Solo quien gana el compare-and-set entrega. Si `aplicado` es false, el
    // webhook llegó antes y ya lo hizo todo.
    if (fila?.r_aplicado === true) {
      const entrega = await entregarVentaPOS(admin, { studioId: sesion.studioId, ventaId });
      return responder('PAGADA', 'PAGADO', {
        entrega: {
          bonos: entrega.suscripcionesCreadas, creditos: entrega.creditos,
          facturaSellada: entrega.facturaSellada, avisos: entrega.avisos,
        },
      });
    }
    return responder('PAGADA', 'PAGADO');
  }

  if (estadoProveedor.estado === 'PROCESANDO' || estadoProveedor.estado === 'PENDIENTE') {
    // Se refleja el estado del proveedor sin cerrar nada. El TPV vuelve a
    // preguntar; el tiempo de espera lo decide él, no esta ruta.
    await admin.from('ventas_pos').update({
      pago_estado: estadoProveedor.estado, pago_actualizado_en: new Date().toISOString(),
    }).eq('id', ventaId).eq('studio_id', sesion.studioId).eq('estado', 'PENDIENTE_PAGO');
    return responder('PENDIENTE_PAGO', estadoProveedor.estado);
  }

  // RECHAZADO / CANCELADO / EXPIRADO / ERROR: se anula y se devuelve el stock.
  await admin.rpc('fallar_pago_venta_pos', {
    p_venta_id: ventaId, p_studio_id: sesion.studioId,
    p_pago_estado: estadoProveedor.estado,
    p_motivo: estadoProveedor.error ?? null,
  });
  return responder('ANULADA', estadoProveedor.estado, { motivo: estadoProveedor.error ?? null });
}
