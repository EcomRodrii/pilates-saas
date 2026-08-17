import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metodoReutilizableDe } from './metodo-reutilizable.ts';

test('tarjeta con setup_future_usage por método: se guarda', () => {
  assert.equal(metodoReutilizableDe({
    payment_method: { id: 'pm_card', type: 'card' },
    payment_method_types: ['card', 'bizum'],
    payment_method_options: { card: { setup_future_usage: 'off_session' } },
  }), 'pm_card');
});

test('Bizum en una sesión que TAMBIÉN ofrecía tarjeta: no se guarda', () => {
  // El bug que este helper existe para impedir: `payment_method_types` incluye
  // 'card' porque se ofreció, pero se pagó con Bizum. Guardar ese PaymentMethod
  // en socios.stripe_payment_method_id rompe el siguiente cobro off-session.
  assert.equal(metodoReutilizableDe({
    payment_method: { id: 'pm_bizum', type: 'bizum' },
    payment_method_types: ['card', 'bizum'],
    payment_method_options: { card: { setup_future_usage: 'off_session' } },
  }), null);
});

test('setup_future_usage global (checkout embebido, y PaymentIntents antiguos)', () => {
  assert.equal(metodoReutilizableDe({
    payment_method: 'pm_card',
    payment_method_types: ['card'],
    setup_future_usage: 'off_session',
  }), 'pm_card');
});

test('sin pedir guardado no se guarda, aunque sea tarjeta', () => {
  assert.equal(metodoReutilizableDe({
    payment_method: { id: 'pm_card', type: 'card' },
    payment_method_types: ['card'],
  }), null);
});

test('sin expandir y con Bizum ofrecido: no se arriesga', () => {
  // No se puede saber el tipo real: mejor pedir la tarjeta otra vez que dejar
  // un método guardado con el que los cobros automáticos fallarán.
  assert.equal(metodoReutilizableDe({
    payment_method: 'pm_desconocido',
    payment_method_types: ['card', 'bizum'],
    payment_method_options: { card: { setup_future_usage: 'off_session' } },
  }), null);
});

test('sin payment_method no hay nada que guardar', () => {
  assert.equal(metodoReutilizableDe({
    payment_method: null,
    payment_method_types: ['card'],
    setup_future_usage: 'off_session',
  }), null);
});

test('un PaymentIntent vacío no revienta', () => {
  assert.equal(metodoReutilizableDe({}), null);
});
