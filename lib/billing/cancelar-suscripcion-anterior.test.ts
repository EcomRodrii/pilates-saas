import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { idACancelar, cancelarSuscripcionAnteriorSiToca } from './cancelar-suscripcion-anterior.ts';

test('sin metadata no hay nada que cancelar', () => {
  assert.equal(idACancelar({ metadata: {}, status: 'active' }), null);
  assert.equal(idACancelar({ metadata: null, status: 'active' }), null);
});

test('con metadata pero la nueva suscripción todavía no está viva, se espera', () => {
  for (const status of ['incomplete', 'incomplete_expired', 'canceled']) {
    assert.equal(idACancelar({ metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status }), null, status);
  }
});

test('con metadata y la nueva suscripción viva (activa, en prueba, o con impago que Stripe sigue reintentando), se cancela', () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
    assert.equal(idACancelar({ metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status }), 'sub_vieja', status);
  }
});

test('cancela de verdad cuando toca', async () => {
  const llamadas: string[] = [];
  const stripeFalso = { subscriptions: { cancel: async (id: string) => { llamadas.push(id); return {} as never; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.deepEqual(llamadas, ['sub_vieja']);
  assert.deepEqual(r, { intentado: true });
});

test('nada que cancelar: ni siquiera llama a Stripe', async () => {
  let llamado = false;
  const stripeFalso = { subscriptions: { cancel: async () => { llamado = true; return {} as never; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: {}, status: 'active' });
  assert.equal(llamado, false);
  assert.deepEqual(r, { intentado: false });
});

test('ya estaba cancelada (resource_missing): no es un error, cuenta como hecho', async () => {
  const stripeFalso = {
    subscriptions: { cancel: async () => { throw new Stripe.errors.StripeError({ code: 'resource_missing', type: 'invalid_request_error' }); } },
  };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.deepEqual(r, { intentado: true });
});

test('un fallo real de Stripe se reporta, pero nunca lanza — no puede tirar el webhook', async () => {
  const boom = new Error('rate limited');
  const stripeFalso = { subscriptions: { cancel: async () => { throw boom; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.equal(r.intentado, true);
  assert.equal(r.errorInesperado, boom);
});
