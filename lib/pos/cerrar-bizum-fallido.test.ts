import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cerrarCheckoutDeBizumFallido, cobroPosDeSesionCaducada, type ClienteSesionesCheckout } from './cerrar-bizum-fallido.ts';

// Un rechazo de Bizum del mostrador no cierra la Checkout Session: la clienta
// puede reintentar en el móvil. Antes, la venta se anulaba igual y el TPV decía
// «no se ha cobrado nada» — cobro en efectivo + reintento = doble cobro.

function fakeStripe(o: {
  listado?: { id: string; status: string | null }[] | 'error';
  expire?: 'expired' | 'error';
  retrieve?: string | 'error';
}) {
  const llamadas = { list: 0, expire: 0, retrieve: 0 };
  const stripe: ClienteSesionesCheckout = {
    checkout: {
      sessions: {
        async list() {
          llamadas.list++;
          if (o.listado === 'error') throw new Error('red');
          return { data: o.listado ?? [] };
        },
        async expire() {
          llamadas.expire++;
          if (o.expire === 'error') throw new Error('unexpected state');
          return { status: o.expire ?? 'expired' };
        },
        async retrieve() {
          llamadas.retrieve++;
          if (o.retrieve === 'error' || o.retrieve === undefined) throw new Error('red');
          return { status: o.retrieve };
        },
      },
    },
  };
  return { stripe, llamadas };
}

test('sesión abierta → se EXPIRA y entonces sí se puede anular la venta', async () => {
  const { stripe, llamadas } = fakeStripe({ listado: [{ id: 'cs_1', status: 'open' }], expire: 'expired' });
  assert.equal(await cerrarCheckoutDeBizumFallido(stripe, 'pi_1', 'acct_1'), 'cerrada');
  assert.equal(llamadas.expire, 1, 'el QR tiene que cerrarse de verdad, no solo anularse la venta');
});

test('⚠️ la clienta pagó entre el rechazo y ahora → NO se anula', async () => {
  const { stripe } = fakeStripe({ listado: [{ id: 'cs_1', status: 'open' }], expire: 'error', retrieve: 'complete' });
  assert.equal(await cerrarCheckoutDeBizumFallido(stripe, 'pi_1', 'acct_1'), 'pagada');
});

test('sesión ya completada o ya caducada en el listado → no se intenta expirar', async () => {
  const pagada = fakeStripe({ listado: [{ id: 'cs_1', status: 'complete' }] });
  assert.equal(await cerrarCheckoutDeBizumFallido(pagada.stripe, 'pi_1', 'acct_1'), 'pagada');
  assert.equal(pagada.llamadas.expire, 0);

  const caducada = fakeStripe({ listado: [{ id: 'cs_1', status: 'expired' }] });
  assert.equal(await cerrarCheckoutDeBizumFallido(caducada.stripe, 'pi_1', 'acct_1'), 'cerrada');
  assert.equal(caducada.llamadas.expire, 0);
});

test('expirar falla porque ya había caducado → cerrada', async () => {
  const { stripe } = fakeStripe({ listado: [{ id: 'cs_1', status: 'open' }], expire: 'error', retrieve: 'expired' });
  assert.equal(await cerrarCheckoutDeBizumFallido(stripe, 'pi_1', 'acct_1'), 'cerrada');
});

test('sin poder preguntar a Stripe → no-se-sabe (el webhook reintenta, no anula)', async () => {
  assert.equal(await cerrarCheckoutDeBizumFallido(fakeStripe({ listado: 'error' }).stripe, 'pi_1', 'acct_1'), 'no-se-sabe');
  const sinRespuesta = fakeStripe({ listado: [{ id: 'cs_1', status: 'open' }], expire: 'error', retrieve: 'error' });
  assert.equal(await cerrarCheckoutDeBizumFallido(sinRespuesta.stripe, 'pi_1', 'acct_1'), 'no-se-sabe');
});

test('el PI no viene de ninguna sesión → sin-sesion', async () => {
  const { stripe, llamadas } = fakeStripe({ listado: [] });
  assert.equal(await cerrarCheckoutDeBizumFallido(stripe, 'pi_1', 'acct_1'), 'sin-sesion');
  assert.equal(llamadas.expire, 0);
});

// ── QR caducado (lo recoge el conciliador) ──────────────────────────────────
test('QR de Bizum caducado con venta → se suelta, aunque nunca naciera el PI', () => {
  assert.deepEqual(
    cobroPosDeSesionCaducada({ id: 'cs_1', status: 'expired', payment_intent: null, metadata: { origen: 'pos_bizum', ventaId: 'v-1', studioId: 's-1' } }),
    { metadata: { ventaId: 'v-1' }, paymentIntentId: null, checkoutSessionId: 'cs_1' },
  );
  assert.deepEqual(
    cobroPosDeSesionCaducada({ id: 'cs_1', status: 'expired', payment_intent: { id: 'pi_1' }, metadata: { origen: 'pos_bizum', reciboId: 'r-1' } }),
    { metadata: { reciboId: 'r-1' }, paymentIntentId: 'pi_1', checkoutSessionId: 'cs_1' },
  );
});

test('QR abierto o pagado, u otra vía → nada que soltar', () => {
  const md = { origen: 'pos_bizum', ventaId: 'v-1' };
  assert.equal(cobroPosDeSesionCaducada({ id: 'cs_1', status: 'open', payment_intent: null, metadata: md }), null);
  assert.equal(cobroPosDeSesionCaducada({ id: 'cs_1', status: 'complete', payment_intent: 'pi_1', metadata: md }), null);
  assert.equal(cobroPosDeSesionCaducada({ id: 'cs_1', status: 'expired', payment_intent: null, metadata: { origen: 'plan_web', ventaId: 'v-1' } }), null);
  assert.equal(cobroPosDeSesionCaducada({ id: 'cs_1', status: 'expired', payment_intent: null, metadata: { origen: 'pos_bizum' } }), null);
});
