import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirSesionCheckout } from './sesion-checkout.ts';

const IMPORTE = 5000; // 50,00€, en céntimos — el importe "actual" del recibo en todos los tests salvo los de M-3.

const abierta = (p: Partial<Parameters<typeof decidirSesionCheckout>[0]> = {}) => ({
  status: 'open',
  url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  payment_method_types: ['card'],
  amount_total: IMPORTE,
  ...p,
});

test('sin sesión previa se crea una', () => {
  assert.equal(decidirSesionCheckout(null, ['card'], IMPORTE), 'crear');
});

test('la sesión abierta del mismo método y mismo importe se REUTILIZA — esto es lo que evita el doble cobro', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card'], IMPORTE), 'reutilizar');
});

test('el orden de los métodos no cuenta', () => {
  const s = abierta({ payment_method_types: ['bizum', 'card'] });
  assert.equal(decidirSesionCheckout(s, ['card', 'bizum'], IMPORTE), 'reutilizar');
});

test('cambiar de método expira la anterior antes de crear: nunca dos pagables a la vez', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card', 'bizum'], IMPORTE), 'expirar-y-crear');
  const conBizum = abierta({ payment_method_types: ['card', 'bizum'] });
  assert.equal(decidirSesionCheckout(conBizum, ['card'], IMPORTE), 'expirar-y-crear');
});

test('una sesión ya pagada o caducada no se toca, se crea otra', () => {
  assert.equal(decidirSesionCheckout(abierta({ status: 'complete' }), ['card'], IMPORTE), 'crear');
  assert.equal(decidirSesionCheckout(abierta({ status: 'expired' }), ['card'], IMPORTE), 'crear');
});

test('abierta y sin URL se expira: no sirve para pagar, pero otro sí podría pagarla', () => {
  assert.equal(decidirSesionCheckout(abierta({ url: null }), ['card'], IMPORTE), 'expirar-y-crear');
});

test('sin payment_method_types no se da por equivalente a lo pedido', () => {
  const s = abierta({ payment_method_types: null });
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE), 'expirar-y-crear');
});

// M-3 (auditoría 22-sep): el importe del recibo se puede editar desde el panel
// sin ninguna condición de estado, y la sesión de Stripe ya creada seguía
// cobrando el importe VIEJO porque la decisión de reutilizar nunca miraba
// `amount_total`. Sin esto: bajar el importe producía un sobrecobro que el
// webhook daba por bueno (marcaba COBRADO por menos de lo cobrado de verdad);
// subirlo hacía que Stripe cobrara de más mientras el webhook lo rechazaba con
// 'Importe insuficiente' — dinero cobrado de verdad, sin recibo ni factura.
test('M-3: el importe del recibo SUBIÓ desde que se abrió la sesión — se expira, nunca se reutiliza', () => {
  const s = abierta({ amount_total: IMPORTE }); // sesión vieja, 50,00€
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE + 3000), 'expirar-y-crear'); // recibo ahora en 80,00€
});

test('M-3: el importe del recibo BAJÓ desde que se abrió la sesión — se expira, nunca se reutiliza', () => {
  const s = abierta({ amount_total: IMPORTE }); // sesión vieja, 50,00€
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE - 2000), 'expirar-y-crear'); // recibo ahora en 30,00€
});

test('M-3: mismos métodos pero `amount_total` desconocido (null) — no se da por bueno, se expira', () => {
  const s = abierta({ amount_total: null });
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE), 'expirar-y-crear');
});

test('M-3: mismo importe pero método distinto — sigue expirando por el método, como antes', () => {
  const s = abierta({ amount_total: IMPORTE, payment_method_types: ['card'] });
  assert.equal(decidirSesionCheckout(s, ['card', 'bizum'], IMPORTE), 'expirar-y-crear');
});
