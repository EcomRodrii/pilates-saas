import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmarCobroRecibo } from '@/lib/billing/confirmar-cobro';
import { entregarVentaPOS } from './venta-servidor.ts';
import { mismoCobro, proveedorDeReferencia } from './sumup.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar un cobro de la Caja que el proveedor ya ha confirmado, cuando el que
// avisa es el PROVEEDOR (el navegador del mostrador puede no estar mirando).
//
// Era el cuerpo del aviso de Stripe (`payment_intent.succeeded` de `pos_terminal`
// / `pos_bizum`). Vive aquí para que el datáfono de SumUp haga exactamente lo
// mismo: dos copias se separan con el tiempo, y aquí cada rama es dinero (una
// venta anulada que cobra, un segundo cobro de la misma venta).
//
// Quien llama ya ha comprobado de quién es el cobro (la cuenta Connect / la API
// de SumUp con el token del estudio) y que el proveedor lo da por pagado.
//
// `aviso` es el prefijo de los mensajes de Sentry: con Stripe son los de siempre
// ('[stripe webhook] …'), para que no se pierda ninguna alerta montada sobre ellos.
// ─────────────────────────────────────────────────────────────────────────────

export type CierrePos = { ok: true } | { ok: false; error: string };
type Aviso = 'stripe webhook' | 'pos/sumup';

/** «Vengo a pagar la cuota» cobrada en el datáfono o por Bizum. */
export async function cerrarReciboPos(admin: SupabaseClient, p: {
  studioId: string;
  reciboId: string;
  metodoCobro: 'TARJETA' | 'BIZUM';
  /** El PaymentIntent de Stripe que cobró, o `null` si fue el datáfono de SumUp. */
  paymentIntentId: string | null;
  /** La transacción de SumUp que cobró (va a `recibos.sumup_transaction_id`). */
  cargoSumup?: string | null;
  /** La referencia del cobro tal como se guardó al empezarlo (PaymentIntent o `sumup:`). */
  referencia: string;
  aviso: Aviso;
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
    Sentry.captureMessage(`[${p.aviso}] recibo cobrado en mostrador sin poder cerrarlo`, {
      level: 'error', tags: { area: 'cobros' },
      extra: { paymentIntentId: p.referencia, reciboId: p.reciboId, studioId: p.studioId, detalle: res.error },
    });
    return { ok: false, error: 'Fallo al cerrar el recibo' };
  }
  await soltarCobroDeMostrador(admin, p.studioId, p.reciboId, p.referencia);
  return { ok: true };
}

/**
 * Suelta el cobro de mostrador guardado en el recibo, salvo que sea un cobro de
 * SumUp DISTINTO del que acaba de cerrar: ese sigue en el Solo, y soltarlo dejaría
 * su aviso sin firma como única forma de enterarse si también cobra. Compare-and-set
 * sobre lo leído: si entre medias empezó otro intento, no se toca.
 */
async function soltarCobroDeMostrador(admin: SupabaseClient, studioId: string, reciboId: string, referencia: string): Promise<void> {
  const { data } = await admin.from('recibos').select('cobro_mostrador_pi')
    .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
  const enVuelo = (data?.cobro_mostrador_pi as string | null | undefined) ?? null;
  if (proveedorDeReferencia(enVuelo) === 'sumup' && !mismoCobro(enVuelo, referencia)) return;
  const soltar = admin.from('recibos').update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
    .eq('id', reciboId).eq('studio_id', studioId);
  await (enVuelo ? soltar.eq('cobro_mostrador_pi', enVuelo) : soltar.is('cobro_mostrador_pi', null));
}

/** Una venta de la Caja cobrada en el datáfono o por Bizum. */
export async function cerrarVentaPos(admin: SupabaseClient, p: {
  studioId: string;
  ventaId: string;
  /** El PaymentIntent de Stripe, o la referencia `sumup:` del datáfono de SumUp. */
  referencia: string;
  /** Con qué clave se anota si hay que reconciliar. Por defecto, la referencia. */
  claveReconciliacion?: string;
  /** Lo que el proveedor dice haber cobrado, en euros. */
  importe: number;
  /** Bizum que acabó pagándose con tarjeta, etc. `null` = el de la venta. */
  metodoPagoReal: string | null;
  /** El concepto del cobro, para la reconciliación. */
  concepto?: string | null;
  aviso: Aviso;
}): Promise<CierrePos> {
  const clave = p.claveReconciliacion ?? p.referencia;
  const { data: conf, error: errConf } = await admin.rpc('confirmar_pago_venta_pos', {
    p_venta_id: p.ventaId,
    p_studio_id: p.studioId,
    p_payment_intent_id: p.referencia,
    p_importe_confirmado: p.importe,
    p_metodo_pago: p.metodoPagoReal,
  });
  if (errConf) {
    Sentry.captureMessage(`[${p.aviso}] no se pudo confirmar la venta POS`, {
      level: 'error', tags: { area: 'cobros' },
      extra: { paymentIntentId: p.referencia, ventaId: p.ventaId, studioId: p.studioId, detalle: errConf.message },
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
    Sentry.captureMessage(`[${p.aviso}] cobro confirmado sobre una venta POS ya anulada`, {
      level: 'error', tags: { area: 'cobros' },
      extra: { paymentIntentId: p.referencia, ventaId: p.ventaId, studioId: p.studioId, importe: p.importe },
    });
    const { error: errRec } = await admin.from('reconciliaciones_pos').insert({
      payment_intent_id: clave, studio_id: p.studioId, importe: p.importe, concepto: p.concepto ?? 'Cobro sobre venta anulada',
    });
    if (errRec && errRec.code !== '23505') return { ok: false, error: 'Fallo al registrar el cobro huérfano' };
    return { ok: true };
  }
  if (filaConf?.r_estado === 'PAGADA') {
    // Ya pagada: si fue con OTRO cobro, han entrado dos. A reconciliar.
    const { data: ventaYaPagada } = await admin.from('ventas_pos')
      .select('stripe_payment_intent_id').eq('id', p.ventaId).eq('studio_id', p.studioId).maybeSingle();
    const previo = (ventaYaPagada?.stripe_payment_intent_id as string | null) ?? null;
    if (previo && !mismoCobro(previo, p.referencia)) {
      Sentry.captureMessage(`[${p.aviso}] SEGUNDO cobro sobre una venta POS ya pagada`, {
        level: 'error', tags: { area: 'cobros', tipo: 'doble-cobro' },
        extra: { paymentIntentId: p.referencia, paymentIntentPrevio: previo, ventaId: p.ventaId, studioId: p.studioId, importe: p.importe },
      });
      const { error: errDup } = await admin.from('reconciliaciones_pos').insert({
        payment_intent_id: clave, studio_id: p.studioId, importe: p.importe, concepto: p.concepto ?? 'Segundo cobro sobre venta ya pagada',
      });
      if (errDup && errDup.code !== '23505') return { ok: false, error: 'Fallo al registrar el cobro duplicado' };
    }
  }
  return { ok: true };
}
