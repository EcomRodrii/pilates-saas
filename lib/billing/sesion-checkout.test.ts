import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirSesionCheckout } from './sesion-checkout.ts';

const abierta = (p: Partial<Parameters<typeof decidirSesionCheckout>[0]> = {}) => ({
  status: 'open',
  url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  payment_method_types: ['card'],
  ...p,
});

test('sin sesión previa se crea una', () => {
  assert.equal(decidirSesionCheckout(null, ['card']), 'crear');
});

test('la sesión abierta del mismo método se REUTILIZA — esto es lo que evita el doble cobro', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card']), 'reutilizar');
});

test('el orden de los métodos no cuenta', () => {
  const s = abierta({ payment_method_types: ['bizum', 'card'] });
  assert.equal(decidirSesionCheckout(s, ['card', 'bizum']), 'reutilizar');
});

test('cambiar de método expira la anterior antes de crear: nunca dos pagables a la vez', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card', 'bizum']), 'expirar-y-crear');
  const conBizum = abierta({ payment_method_types: ['card', 'bizum'] });
  assert.equal(decidirSesionCheckout(conBizum, ['card']), 'expirar-y-crear');
});

test('una sesión ya pagada o caducada no se toca, se crea otra', () => {
  assert.equal(decidirSesionCheckout(abierta({ status: 'complete' }), ['card']), 'crear');
  assert.equal(decidirSesionCheckout(abierta({ status: 'expired' }), ['card']), 'crear');
});

test('abierta y sin URL se expira: no sirve para pagar, pero otro sí podría pagarla', () => {
  assert.equal(decidirSesionCheckout(abierta({ url: null }), ['card']), 'expirar-y-crear');
});

test('sin payment_method_types no se da por equivalente a lo pedido', () => {
  const s = abierta({ payment_method_types: null });
  assert.equal(decidirSesionCheckout(s, ['card']), 'expirar-y-crear');
});
