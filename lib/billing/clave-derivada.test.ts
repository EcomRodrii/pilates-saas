import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveTras, LONGITUD_MAXIMA_CLAVE_STRIPE } from './clave-derivada.ts';
import { claveCheckoutRecibo, claveTrasSesion } from './sesion-checkout.ts';
import { claveTrasCobro } from './pago-anterior.ts';

// Un id de recibo largo (en producción llegan a 50) y ids de Stripe de su tamaño real.
const RECIBO_LARGO = `rec-web-${'x'.repeat(42)}`;
const sesion = (n: number) => `cs_test_a1${String(n).padStart(2, '0')}${'B'.repeat(56)}`;
const cobro = (n: number) => `pi_3${String(n).padStart(2, '0')}${'C'.repeat(22)}`;

test('cinco repeticiones caducadas seguidas: nunca pasa de 255 y cada vuelta es otra clave', () => {
  const base = claveCheckoutRecibo(RECIBO_LARGO, ['bizum', 'card'], 123456, { modo: 'hospedado', pagadorVerificado: true }, Date.UTC(2026, 9, 7, 10, 0));
  let clave = base;
  const vistas = new Set([clave]);
  for (let vuelta = 1; vuelta <= 5; vuelta++) {
    clave = claveTrasSesion(clave, sesion(vuelta));
    assert.ok(clave.length <= LONGITUD_MAXIMA_CLAVE_STRIPE, `vuelta ${vuelta}: ${clave.length} caracteres`);
    assert.ok(clave.startsWith(`${base}:tras-`), 'conserva la raíz del intento');
    assert.ok(!vistas.has(clave), `vuelta ${vuelta}: repite una clave anterior`);
    vistas.add(clave);
  }
  // Y no crece: la quinta mide lo mismo que la primera.
  assert.equal(claveTrasSesion(base, sesion(1)).length, clave.length);
});

test('lo mismo en el cobro de la Tienda (PaymentIntent)', () => {
  let clave = `checkout-embebido-v2-studio-1-plan-1-${'h'.repeat(64)}`;
  for (let vuelta = 1; vuelta <= 5; vuelta++) {
    const antes = clave;
    clave = claveTrasCobro(clave, cobro(vuelta));
    assert.ok(clave.length <= LONGITUD_MAXIMA_CLAVE_STRIPE);
    assert.notEqual(clave, antes);
  }
});

test('estable: la misma clave y el mismo cobro muerto dan la misma derivada (dos pestañas del mismo intento)', () => {
  assert.equal(claveTras('k', 'cs_1'), claveTras('k', 'cs_1'));
  assert.notEqual(claveTras('k', 'cs_1'), claveTras('k', 'cs_2'), 'otro cobro muerto, otra clave');
  assert.notEqual(claveTras('k', 'cs_1'), claveTras('k2', 'cs_1'), 'otro intento, otra clave');
  // La cadena cuenta: la misma sesión muerta desde dos vueltas distintas no colisiona.
  assert.notEqual(claveTras(claveTras('k', 'cs_1'), 'cs_2'), claveTras(claveTras('k', 'cs_3'), 'cs_2'));
});

test('ni con una raíz desmesurada pasa del límite', () => {
  const enorme = 'r'.repeat(400);
  const d = claveTras(enorme, 'cs_x');
  assert.ok(d.length <= LONGITUD_MAXIMA_CLAVE_STRIPE, String(d.length));
  assert.notEqual(d, claveTras(enorme, 'cs_y'));
  assert.ok(claveTras(d, 'cs_z').length <= LONGITUD_MAXIMA_CLAVE_STRIPE);
});
