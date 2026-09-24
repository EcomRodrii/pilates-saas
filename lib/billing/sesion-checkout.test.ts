import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirSesionCheckout, claveCheckoutRecibo } from './sesion-checkout.ts';
import { readFileSync } from 'node:fs';

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

// ─────────────────────────────────────────────────────────────────────────────
// PAY-3 (auditoría 2026-09-23). M-3 quedó CORRECTO en la decisión y ROTO en la
// ejecución: `decidirSesionCheckout` devuelve 'expirar-y-crear' cuando cambia
// el importe, la ruta expira la sesión vieja y pide una nueva… con la MISMA
// clave de idempotencia, que no llevaba el importe, y `unit_amount` distinto.
// Stripe rechaza reutilizar una clave con parámetros distintos, el error caía
// en el catch genérico (500 «No se pudo iniciar el cobro») y la socia quedaba
// SIN poder pagar hasta que la clave caducase en Stripe (~24 h), con la sesión
// anterior ya expirada. Corregir un importe desde el panel dejaba el recibo
// impagable durante un día: peor que el bug que M-3 venía a arreglar.
// ─────────────────────────────────────────────────────────────────────────────

// Instante fijo para las claves: desde D-3 llevan ventana temporal, y dos
// llamadas del mismo test podrían caer en minutos distintos justo en el cambio
// de minuto. El reloj se inyecta para que el test hable de lo que quiere hablar.
const T0 = Date.parse('2026-09-24T10:00:00.000Z');

test('PAY-3: dos importes distintos del mismo recibo dan claves de idempotencia distintas', () => {
  const a = claveCheckoutRecibo('rec-1', ['card'], 5000, T0);
  const b = claveCheckoutRecibo('rec-1', ['card'], 8000, T0);
  assert.notEqual(a, b, 'sin esto, la sesión nueva tras `expirar-y-crear` la rechaza Stripe');
});

test('PAY-3: la protección de la doble pestaña se conserva — mismo recibo e importe, misma clave', () => {
  assert.equal(
    claveCheckoutRecibo('rec-1', ['card', 'bizum'], 5000, T0),
    claveCheckoutRecibo('rec-1', ['bizum', 'card'], 5000, T0),
    'el orden de los métodos no puede cambiar la clave: dos peticiones simultáneas comparten sesión',
  );
});

test('PAY-3: cambiar el método sigue dando clave distinta, como antes', () => {
  assert.notEqual(
    claveCheckoutRecibo('rec-1', ['card'], 5000, T0),
    claveCheckoutRecibo('rec-1', ['card', 'bizum'], 5000, T0),
  );
});

test('PAY-3: la ruta de checkout usa el helper, no una clave construida a mano', () => {
  // El bug nació de tener la clave en línea en la ruta y el discriminante de
  // importe en `lib/`: dos gemelos que divergieron. Esto impide que se separen
  // otra vez.
  const ruta = readFileSync(new URL('../../app/api/stripe/checkout/route.ts', import.meta.url), 'utf8');
  assert.ok(ruta.includes('claveCheckoutRecibo('), 'la clave del recibo sale de sesion-checkout.ts');
  assert.ok(
    !/idempotencyKey: `checkout-\$\{body\.reciboId\}/.test(ruta),
    'no queda ninguna clave de recibo construida a mano en la ruta',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// D-3 (auditoría 2026-09-24). PAY-3 cerró el primer cambio de importe, no el
// segundo. La clave era permanente: deshacer la corrección y volver al importe
// original la reutilizaba, y Stripe devolvía en caché la URL de la sesión que
// `expirar-y-crear` YA había expirado. Enlace muerto para la socia.
// ─────────────────────────────────────────────────────────────────────────────

test('D-3: volver al importe original NO reutiliza la clave de la sesión ya expirada', () => {
  const primera = claveCheckoutRecibo('rec-1', ['card'], 5000, T0);
  // El panel corrige a 80 € (sesión nueva) y después deshace la corrección.
  const vuelta = claveCheckoutRecibo('rec-1', ['card'], 5000, T0 + 5 * 60_000);
  assert.notEqual(
    primera, vuelta,
    'sin ventana temporal, Stripe devuelve cacheada la URL de una sesión expirada',
  );
});

test('D-3: la ventana no rompe la doble pestaña — dos peticiones del mismo minuto comparten clave', () => {
  assert.equal(
    claveCheckoutRecibo('rec-1', ['card'], 5000, T0 + 1_000),
    claveCheckoutRecibo('rec-1', ['card'], 5000, T0 + 40_000),
    'el caso que motivó la clave (doble clic) cae siempre dentro del mismo minuto',
  );
});
