import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmarCobroRecibo } from '@/lib/billing/confirmar-cobro';
import { entregarVentaPOS } from './venta-servidor.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar un cobro de la Caja que el proveedor ya ha confirmado, cuando el que
// avisa es el PROVEEDOR (el navegador del mostrador puede no estar mirando).
//
// Era el cuerpo del aviso de Stripe (`payment_intent.succeeded` de `pos_terminal`
// / `pos_bizum`). Vive aquí para que el aviso del datáfono de SumUp haga
// exactamente lo mismo: dos copias se separan con el tiempo, y aquí cada rama es
// dinero (una venta anulada que cobra, un segundo cobro de la misma venta).
//
// Quien llama ya ha comprobado de quién es el cobro (la cuenta Connect / la URL
// firmada de SumUp) y que el proveedor lo da por pagado.
// ─────────────────────────────────────────────────────────────────────────────

export type CierrePos = { ok: true } | { ok: false; error: string };

/** «Vengo a pagar la cuota» cobrada en el datáfono o por Bizum. */
export async function cerrarReciboPos(admin: SupabaseClient, p: {
  studioId: string;
  reciboId: string;
  metodoCobro: 'TARJETA' | 'BIZUM';
  /** El PaymentIntent de Stripe que cobró, o `null` si fue el datáfono de SumUp. */
  paymentIntentId: string | null;
  /** La transacción de SumUp que cobró (va a `recibos.sumup_transaction_id`). */
  cargoSumup?: string | null;
  /** Para el aviso: la referencia del cobro tal como llegó. */
  referencia: string;
}): Promise<CierrePos> {
  const res = await confirmarCobroRecibo(admin, {
    studioId: p.studioId,
    reciboId: p.reciboId,
    metodoCobro: p.metodoCobro,
    paymentIntentId: p.paymentIntentId,
    cargoSumup: p.cargoSumup ?? null,
    fuente: 'tpv',
    // Sin persona: lo cierra el aviso del proveedor.
    actor: { userId: null, nombre: 'Datáfono' },
  });
  if (!res.ok) {
    Sentry.captureMessage('[pos] recibo cobrado en mostrador sin poder cerrarlo', {
      level: 'error', tags: { area: 'cobros' },
      extra: { referencia: p.referencia, reciboId: p.reciboId, studioId: p.studioId, detalle: res.error },
    });
    return { ok: false, error: 'Fallo al cerrar el recibo' };
  }
  await admin.from('recibos').update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId);
  return { ok: true };
}

/** Una venta de la Caja cobrada en el datáfono o por Bizum. */
export async function cerrarVentaPos(admin: SupabaseClient, p: {
  studioId: string;
  ventaId: string;
  /** El PaymentIntent de Stripe, o la referencia `sumup:` del datáfono de SumUp. */
  referencia: string;
  /** Lo que el proveedor dice haber cobrado, en euros. */
  importe: number;
  /** Bizum que acabó pagándose con tarjeta, etc. `null` = el de la venta. */
  metodoPagoReal: string | null;
  concepto?: string | null;
}): Promise<CierrePos> {
  const { data: conf, error: errConf } = await admin.rpc('confirmar_pago_venta_pos', {
    p_venta_id: p.ventaId,
    p_studio_id: p.studioId,
    p_payment_intent_id: p.referencia,
    p_importe_confirmado: p.importe,
    p_metodo_pago: p.metodoPagoReal,
  });
  if (errConf) {
    Sentry.captureMessage('[pos] no se pudo confirmar la venta', {
      level: 'error', tags: { area: 'cobros' },
      extra: { referencia: p.referencia, ventaId: p.ventaId, studioId: p.studioId, detalle: errConf.message },
    });
    return { ok: false, error: 'Fallo al confirmar la venta' };
  }
  const filaConf = Array.isArray(conf) ? conf[0] : conf;
  if (filaConf?.r_aplicado === true) {
    await entregarVentaPOS(admin, { studioId: p.studioId, ventaId: p.ventaId });
    return { ok: true };
  }
  if (filaConf?.r_estado === 'ANULADA') {
    // Ha entrado dinero sobre una venta que ya se dio por perdida: a reconciliar.
    Sentry.captureMessage('[pos] cobro confirmado sobre una venta ya anulada', {
      level: 'error', tags: { area: 'cobros' },
      extra: { referencia: p.referencia, ventaId: p.ventaId, studioId: p.studioId, importe: p.importe },
    });
    const { error: errRec } = await admin.from('reconciliaciones_pos').insert({
      payment_intent_id: p.referencia, studio_id: p.studioId, importe: p.importe,
      concepto: p.concepto ?? 'Cobro sobre venta anulada',
    });
    if (errRec && errRec.code !== '23505') return { ok: false, error: 'Fallo al registrar el cobro huérfano' };
    return { ok: true };
  }
  if (filaConf?.r_estado === 'PAGADA') {
    // Ya pagada: si fue con OTRO cobro, han entrado dos. A reconciliar.
    const { data: ventaYaPagada } = await admin.from('ventas_pos')
      .select('stripe_payment_intent_id').eq('id', p.ventaId).eq('studio_id', p.studioId).maybeSingle();
    const previo = (ventaYaPagada?.stripe_payment_intent_id as string | null) ?? null;
    if (previo && previo !== p.referencia) {
      Sentry.captureMessage('[pos] SEGUNDO cobro sobre una venta ya pagada', {
        level: 'error', tags: { area: 'cobros', tipo: 'doble-cobro' },
        extra: { referencia: p.referencia, referenciaPrevia: previo, ventaId: p.ventaId, studioId: p.studioId, importe: p.importe },
      });
      const { error: errDup } = await admin.from('reconciliaciones_pos').insert({
        payment_intent_id: p.referencia, studio_id: p.studioId, importe: p.importe,
        concepto: p.concepto ?? 'Segundo cobro sobre venta ya pagada',
      });
      if (errDup && errDup.code !== '23505') return { ok: false, error: 'Fallo al registrar el cobro duplicado' };
    }
  }
  return { ok: true };
}
