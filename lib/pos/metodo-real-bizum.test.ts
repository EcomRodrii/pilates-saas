import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metodoRealBizum } from './metodo-real-bizum.ts';

// P-3 (27ª pasada) + 28ª pasada: la sesión de Bizum del mostrador acepta
// también tarjeta (#1744), así que el origen ('pos_bizum') es solo una PISTA
// de qué proveedor se usó para lanzar el cobro, no de qué medio empleó la
// clienta al pagar. Esta es la derivación ÚNICA que comparten el webhook y
// los dos caminos síncronos (recibo/venta) — antes cada uno la resolvía (o no)
// por su cuenta.

function fakeStripe(chargeType: string | undefined, opts: { fallaRetrieve?: boolean } = {}) {
  const llamadas: { chargeId: string; stripeAccount?: string }[] = [];
  return {
    stripe: {
      charges: {
        retrieve(chargeId: string, _params: unknown, opciones?: { stripeAccount?: string }) {
          llamadas.push({ chargeId, stripeAccount: opciones?.stripeAccount });
          if (opts.fallaRetrieve) return Promise.reject(new Error('Stripe caído'));
          return Promise.resolve({ payment_method_details: chargeType ? { type: chargeType } : undefined });
        },
      },
    } as never,
    llamadas,
  };
}

test('cargo real de tipo bizum → BIZUM', async () => {
  const { stripe } = fakeStripe('bizum');
  const r = await metodoRealBizum(stripe, { latest_charge: 'ch_1' }, 'acct_1');
  assert.equal(r, 'BIZUM');
});

test('cargo real de tipo card → TARJETA, aunque el cobro se lanzara como Bizum', async () => {
  const { stripe } = fakeStripe('card');
  const r = await metodoRealBizum(stripe, { latest_charge: 'ch_1' }, 'acct_1');
  assert.equal(r, 'TARJETA');
});

test('acepta el cargo como objeto expandido, no solo como id', async () => {
  const { stripe } = fakeStripe('card');
  const r = await metodoRealBizum(stripe, { latest_charge: { id: 'ch_1' } as never }, 'acct_1');
  assert.equal(r, 'TARJETA');
});

test('sin cargo todavía (latest_charge null): BIZUM como pista, sin llamar a Stripe', async () => {
  const { stripe, llamadas } = fakeStripe('card');
  const r = await metodoRealBizum(stripe, { latest_charge: null }, 'acct_1');
  assert.equal(r, 'BIZUM');
  assert.equal(llamadas.length, 0);
});

test('si falla la lectura del cargo, se queda con BIZUM (el origen como pista) en vez de tumbar el cierre', async () => {
  const { stripe } = fakeStripe('card', { fallaRetrieve: true });
  const r = await metodoRealBizum(stripe, { latest_charge: 'ch_1' }, 'acct_1');
  assert.equal(r, 'BIZUM');
});

test('pasa la cuenta Connect a Stripe, no la de la plataforma', async () => {
  const { stripe, llamadas } = fakeStripe('bizum');
  await metodoRealBizum(stripe, { latest_charge: 'ch_1' }, 'acct_estudio');
  assert.equal(llamadas[0].stripeAccount, 'acct_estudio');
});
