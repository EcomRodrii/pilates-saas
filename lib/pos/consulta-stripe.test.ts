import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { consultarCobroBizum, estadoDesdeStripe } from './consulta-stripe.ts';

// Bizum del mostrador: cuando Stripe crea la sesión de Checkout sin PaymentIntent,
// la referencia guardada es la sesión (`cs_…`). Consultarla como PaymentIntent
// fallaba siempre y el mostrador se quedaba en PROCESANDO para siempre.

const CUENTA = 'acct_estudio';

function doble(opts: {
  sesion?: Record<string, unknown> | Error;
  pis?: Record<string, Record<string, unknown>>;
  tipoCargo?: string;
} = {}) {
  const llamadas: string[] = [];
  const stripe = {
    checkout: {
      sessions: {
        retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
          llamadas.push(`sesion:${id}:${o?.stripeAccount}`);
          return opts.sesion instanceof Error || !opts.sesion ? Promise.reject(opts.sesion ?? new Error('sin sesión')) : Promise.resolve(opts.sesion);
        },
      },
    },
    paymentIntents: {
      retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
        llamadas.push(`pi:${id}:${o?.stripeAccount}`);
        const pi = opts.pis?.[id];
        return pi ? Promise.resolve(pi) : Promise.reject(new Error('No such payment_intent'));
      },
    },
    charges: {
      retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
        llamadas.push(`cargo:${id}:${o?.stripeAccount}`);
        return Promise.resolve({ payment_method_details: { type: opts.tipoCargo ?? 'bizum' } });
      },
    },
  } as never;
  return { stripe, llamadas };
}

const PI_PAGADO = {
  id: 'pi_1', status: 'succeeded', amount_received: 4500, latest_charge: 'ch_1',
  metadata: { studioId: 'st-1', reciboId: 'rec-1', origen: 'pos_bizum' },
};

test('⚠️ sesión caducada → EXPIRADO, sin preguntar por un PaymentIntent que no existe', async () => {
  const { stripe, llamadas } = doble({ sesion: { id: 'cs_1', status: 'expired', payment_status: 'unpaid', payment_intent: null } });
  assert.deepEqual(await consultarCobroBizum(stripe, 'cs_1', CUENTA), { estado: 'EXPIRADO' });
  assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`]);
});

test('sesión abierta → PENDIENTE; completada con el pago sin entrar → PROCESANDO', async () => {
  for (const [sesion, estado] of [
    [{ id: 'cs_1', status: 'open', payment_status: 'unpaid', payment_intent: null }, 'PENDIENTE'],
    [{ id: 'cs_1', status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_1' }, 'PROCESANDO'],
  ] as const) {
    const { stripe, llamadas } = doble({ sesion, pis: { pi_1: PI_PAGADO } });
    assert.deepEqual(await consultarCobroBizum(stripe, 'cs_1', CUENTA), { estado }, sesion.status);
    assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`], 'sin pago no se mira nada más');
  }
});

test('⚠️ sesión pagada con su PaymentIntent → PAGADO con lo que dice ÉL, y devuelve su id', async () => {
  const { stripe, llamadas } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 9999, metadata: { reciboId: 'otro' } },
    pis: { pi_1: PI_PAGADO }, tipoCargo: 'card',
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.equal(r.estado, 'PAGADO');
  assert.equal(r.paymentIntentId, 'pi_1');
  assert.equal(r.importeCentimos, 4500, 'el importe cobrado del PaymentIntent, no el de la sesión');
  assert.deepEqual(r.metadata, PI_PAGADO.metadata);
  assert.equal(r.metodoReal, 'TARJETA', 'el método del cargo real');
  assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`, `pi:pi_1:${CUENTA}`, `cargo:ch_1:${CUENTA}`], 'todo en la cuenta Connect del estudio');
});

test('sesión pagada con el PaymentIntent expandido → también su id', async () => {
  const { stripe } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_1' } },
    pis: { pi_1: PI_PAGADO },
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.equal(r.estado, 'PAGADO');
  assert.equal(r.paymentIntentId, 'pi_1');
});

test('sesión pagada sin PaymentIntent → PAGADO con el importe y la metadata de la sesión, sin id que guardar', async () => {
  const { stripe } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: null, amount_total: 4500, metadata: { reciboId: 'rec-1', studioId: 'st-1' } },
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.deepEqual(r, { estado: 'PAGADO', importeCentimos: 4500, metadata: { reciboId: 'rec-1', studioId: 'st-1' } });
});

test('⚠️ no poder preguntar no es «no pagado»: fallo de la sesión o de su PaymentIntent → PROCESANDO', async () => {
  const caida = doble({ sesion: new Error('Stripe caído') });
  assert.deepEqual(await consultarCobroBizum(caida.stripe, 'cs_1', CUENTA), { estado: 'PROCESANDO' });
  const sinPi = doble({ sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_x' } });
  assert.deepEqual(await consultarCobroBizum(sinPi.stripe, 'cs_1', CUENTA), { estado: 'PROCESANDO' });
});

test('referencia de PaymentIntent → como siempre, sin tocar sesiones', async () => {
  const { stripe, llamadas } = doble({
    pis: { pi_2: { id: 'pi_2', status: 'requires_payment_method', amount_received: 0, latest_charge: null, metadata: {}, last_payment_error: { message: 'Denegada' } } },
  });
  const r = await consultarCobroBizum(stripe, 'pi_2', CUENTA);
  assert.equal(r.estado, 'PENDIENTE');
  assert.equal(r.error, 'Denegada');
  assert.equal(r.paymentIntentId, undefined, 'la referencia ya es el PaymentIntent');
  assert.deepEqual(llamadas, [`pi:pi_2:${CUENTA}`]);
});

test('estados de Stripe: nada desconocido se lee como cobrado', () => {
  assert.equal(estadoDesdeStripe('succeeded'), 'PAGADO');
  assert.equal(estadoDesdeStripe('canceled'), 'CANCELADO');
  assert.equal(estadoDesdeStripe('processing'), 'PROCESANDO');
  assert.equal(estadoDesdeStripe('algo_nuevo' as never), 'ERROR');
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const leer = (ruta: string) => sinComentarios(readFileSync(join(import.meta.dirname, '../..', ruta), 'utf8'));

test('⚠️ Bizum consulta con `consultarCobroBizum` y expira la sesión aunque la referencia sea ella', () => {
  const terminal = leer('lib/pos/terminal.ts');
  const bizum = terminal.slice(terminal.indexOf('function crearProveedorBizum('), terminal.indexOf('const PROVEEDOR_MANUAL'));
  assert.ok(bizum.includes('return consultarCobroBizum(ctx.stripe, referencia, ctx.stripeAccount);'));
  assert.ok(bizum.includes("checkoutSessionIdGuardada ?? (referencia.startsWith('cs_') ? referencia : null)"));
  assert.doesNotMatch(terminal, /function estadoDesdeStripe/, 'una sola traducción de estados');
});

test('⚠️ al cerrar un cobro de Bizum se guarda el PaymentIntent que cobró, nunca la sesión', () => {
  const recibo = leer('app/api/pos/recibo/confirmar/route.ts');
  assert.ok(recibo.includes("paymentIntentId: est.paymentIntentId\n          ?? (recibo.cobro_mostrador_pi.startsWith('cs_') ? null : recibo.cobro_mostrador_pi),"));
  const venta = leer('app/api/pos/venta/confirmar/route.ts');
  assert.ok(venta.includes("p_payment_intent_id: estadoProveedor.paymentIntentId\n        ?? (venta.stripe_payment_intent_id.startsWith('cs_') ? null : venta.stripe_payment_intent_id),"));
});
