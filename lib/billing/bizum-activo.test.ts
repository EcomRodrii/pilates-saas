import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { bizumActivo } from './bizum-activo.ts';

function stripeQueDevuelve(capabilities: Stripe.Account['capabilities']): Stripe {
  return {
    accounts: { retrieve: async () => ({ capabilities }) },
  } as unknown as Stripe;
}

test('bizum_payments active -> true', async () => {
  const stripe = stripeQueDevuelve({ bizum_payments: 'active' });
  assert.equal(await bizumActivo(stripe, 'acct_1'), true);
});

test('bizum_payments pending/inactive -> false, no un error', async () => {
  const stripe = stripeQueDevuelve({ bizum_payments: 'pending' });
  assert.equal(await bizumActivo(stripe, 'acct_1'), false);
});

test('sin capacidad ninguna en la respuesta -> false', async () => {
  const stripe = stripeQueDevuelve(undefined);
  assert.equal(await bizumActivo(stripe, 'acct_1'), false);
});

test('un fallo de Stripe nunca propaga -- fail-closed', async () => {
  const stripe = {
    accounts: { retrieve: async () => { throw new Error('Stripe caído'); } },
  } as unknown as Stripe;
  assert.equal(await bizumActivo(stripe, 'acct_1'), false);
});
