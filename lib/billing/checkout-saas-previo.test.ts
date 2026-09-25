import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidirCheckoutPrevio, consultarCheckoutPrevio } from './checkout-saas-previo.ts';

const base = { plan: 'ESTUDIO', suscripciones: [], sesionesAbiertas: [], hayDescuentoNuevo: false };

test('sin nada previo: se crea el Checkout', () => {
  assert.deepEqual(decidirCheckoutPrevio(base), { accion: 'crear', expirar: [] });
});

test('⚠️ PAY-5: una suscripción viva en Stripe bloquea, aunque nuestra BD aún no la conozca', () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
    const d = decidirCheckoutPrevio({ ...base, suscripciones: [{ id: 'sub_1', status }] });
    assert.equal(d.accion, 'bloquear', status);
  }
});

test('una suscripción cancelada o incompleta NO bloquea (se puede volver a contratar)', () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    assert.equal(decidirCheckoutPrevio({ ...base, suscripciones: [{ id: 'sub_1', status }] }).accion, 'crear', status);
  }
});

test('un Checkout abierto del MISMO plan se reutiliza en vez de abrir otro', () => {
  const d = decidirCheckoutPrevio({ ...base, sesionesAbiertas: [{ id: 'cs_1', url: 'https://pago/1', plan: 'ESTUDIO' }] });
  assert.deepEqual(d, { accion: 'reutilizar', url: 'https://pago/1', expirar: [] });
});

test('uno abierto de OTRO plan se caduca y se crea el nuevo', () => {
  const d = decidirCheckoutPrevio({ ...base, sesionesAbiertas: [{ id: 'cs_1', url: 'https://pago/1', plan: 'BASE' }] });
  assert.deepEqual(d, { accion: 'crear', expirar: ['cs_1'] });
});

test('con dos abiertos del mismo plan se reutiliza uno y se caduca el otro: nunca dos formas de pagar', () => {
  const d = decidirCheckoutPrevio({
    ...base, sesionesAbiertas: [
      { id: 'cs_1', url: 'https://pago/1', plan: 'ESTUDIO' }, { id: 'cs_2', url: 'https://pago/2', plan: 'ESTUDIO' },
    ],
  });
  assert.equal(d.accion, 'reutilizar');
  assert.deepEqual(d.expirar, ['cs_2']);
});

test('si esta petición acaba de canjear un descuento NO se reutiliza una sesión vieja (no lo lleva): se caduca y se crea', () => {
  const d = decidirCheckoutPrevio({
    ...base, hayDescuentoNuevo: true, sesionesAbiertas: [{ id: 'cs_1', url: 'https://pago/1', plan: 'ESTUDIO' }],
  });
  assert.deepEqual(d, { accion: 'crear', expirar: ['cs_1'] });
});

test('consultarCheckoutPrevio pregunta a Stripe por el customer y solo cuenta sesiones de suscripción', async () => {
  const llamadas: string[] = [];
  const stripe = {
    subscriptions: { list: async (p: { customer: string }) => { llamadas.push(`subs:${p.customer}`); return { data: [] }; } },
    checkout: {
      sessions: {
        list: async (p: { customer: string }) => {
          llamadas.push(`ses:${p.customer}`);
          return { data: [
            { id: 'cs_pago', mode: 'payment', url: 'https://x', metadata: { plan: 'ESTUDIO' } },
            { id: 'cs_sub', mode: 'subscription', url: 'https://y', metadata: { plan: 'ESTUDIO' } },
          ] };
        },
      },
    },
  } as unknown as Parameters<typeof consultarCheckoutPrevio>[0];
  const d = await consultarCheckoutPrevio(stripe, 'cus_1', 'ESTUDIO', false);
  assert.deepEqual(llamadas.sort(), ['ses:cus_1', 'subs:cus_1']);
  assert.deepEqual(d, { accion: 'reutilizar', url: 'https://y', expirar: [] });
});

test('⚠️ la ruta consulta a Stripe ANTES de crear el Checkout, en las dos ramas (CADENA y BASE/ESTUDIO)', () => {
  const ruta = readFileSync(new URL('../../app/api/billing/checkout/route.ts', import.meta.url), 'utf8');
  const creaciones: number[] = [];
  for (let i = ruta.indexOf('stripe.checkout.sessions.create('); i > 0; i = ruta.indexOf('stripe.checkout.sessions.create(', i + 1)) creaciones.push(i);
  assert.equal(creaciones.length, 2, 'dos ramas de alta');
  const previos: number[] = [];
  for (let i = ruta.indexOf('await checkoutPrevio('); i > 0; i = ruta.indexOf('await checkoutPrevio(', i + 1)) previos.push(i);
  assert.equal(previos.length, 2);
  creaciones.forEach((c, k) => assert.ok(previos[k] < c, `la rama ${k + 1} consulta antes de crear`));
});
