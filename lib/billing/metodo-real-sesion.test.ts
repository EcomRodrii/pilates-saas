import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { metodoRealDeSesion } from './metodo-real-sesion.ts';

function sesion(paymentMethodTypes: string[], paymentIntent: string | null = 'pi_1'): Stripe.Checkout.Session {
  return { payment_method_types: paymentMethodTypes, payment_intent: paymentIntent } as unknown as Stripe.Checkout.Session;
}

test('sesión sin bizum entre las opciones -> TARJETA sin llamar a Stripe', async () => {
  let llamado = false;
  const stripe = { paymentIntents: { retrieve: async () => { llamado = true; return {}; } } } as unknown as Stripe;
  const r = await metodoRealDeSesion(stripe, sesion(['card']), null);
  assert.equal(r, 'TARJETA');
  assert.equal(llamado, false);
});

test('bizum ofrecido y la clienta pagó con bizum de verdad -> BIZUM', async () => {
  const stripe = {
    paymentIntents: {
      retrieve: async () => ({ latest_charge: { payment_method_details: { type: 'bizum' } } }),
    },
  } as unknown as Stripe;
  const r = await metodoRealDeSesion(stripe, sesion(['card', 'bizum']), 'acct_1');
  assert.equal(r, 'BIZUM');
});

test('bizum ofrecido pero la clienta pagó con tarjeta -> TARJETA', async () => {
  const stripe = {
    paymentIntents: {
      retrieve: async () => ({ latest_charge: { payment_method_details: { type: 'card' } } }),
    },
  } as unknown as Stripe;
  const r = await metodoRealDeSesion(stripe, sesion(['card', 'bizum']), 'acct_1');
  assert.equal(r, 'TARJETA');
});

test('payment_intent no expandido (no es string) -> TARJETA sin llamar a Stripe', async () => {
  let llamado = false;
  const stripe = { paymentIntents: { retrieve: async () => { llamado = true; return {}; } } } as unknown as Stripe;
  const r = await metodoRealDeSesion(stripe, sesion(['card', 'bizum'], null), null);
  assert.equal(r, 'TARJETA');
  assert.equal(llamado, false);
});

test('un fallo de Stripe nunca tumba el cobro -- cae a TARJETA', async () => {
  const stripe = {
    paymentIntents: { retrieve: async () => { throw new Error('Stripe caído'); } },
  } as unknown as Stripe;
  const r = await metodoRealDeSesion(stripe, sesion(['card', 'bizum']), 'acct_1');
  assert.equal(r, 'TARJETA');
});
