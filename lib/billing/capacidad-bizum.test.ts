import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { solicitarCapacidadBizum } from './capacidad-bizum.ts';

function stripeFalso(estado: {
  capabilities?: Stripe.Account.Capabilities;
  falla?: boolean;
}): { stripe: Stripe; llamadas: { id: string; params: unknown }[] } {
  const llamadas: { id: string; params: unknown }[] = [];
  const stripe = {
    accounts: {
      update: async (id: string, params: unknown) => {
        llamadas.push({ id, params });
        if (estado.falla) throw new Error('stripe caido');
        return { id, capabilities: estado.capabilities ?? { bizum_payments: 'pending' } };
      },
    },
  } as unknown as Stripe;
  return { stripe, llamadas };
}

test('solicitarCapacidadBizum: pide bizum_payments sobre la cuenta conectada', async () => {
  const { stripe, llamadas } = stripeFalso({});
  const r = await solicitarCapacidadBizum(stripe, 'acct_123');
  assert.equal(r.ok, true);
  assert.equal(r.estado, 'pending');
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].id, 'acct_123');
  assert.deepEqual(llamadas[0].params, { capabilities: { bizum_payments: { requested: true } } });
});

test('solicitarCapacidadBizum: devuelve el estado real que Stripe reporta (active/pending/inactive)', async () => {
  const { stripe } = stripeFalso({ capabilities: { bizum_payments: 'active' } });
  const r = await solicitarCapacidadBizum(stripe, 'acct_123');
  assert.equal(r.estado, 'active');
});

test('solicitarCapacidadBizum: un fallo de Stripe NUNCA propaga -- falla-suave', async () => {
  const { stripe } = stripeFalso({ falla: true });
  const r = await solicitarCapacidadBizum(stripe, 'acct_123');
  assert.deepEqual(r, { stripeAccount: 'acct_123', ok: false });
});
