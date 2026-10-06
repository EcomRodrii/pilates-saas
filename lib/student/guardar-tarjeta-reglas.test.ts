import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esperaAntesDe, leerConfirmacionTarjeta, lineaConsentimiento, textoTarjeta } from './guardar-tarjeta-reglas.ts';

// «Tarjeta guardada» SOLO cuando el servidor lee en la ficha la tarjeta de esa sesión.

const GUARDADA = { confirmacion: 'guardada', tarjeta: { marca: 'mastercard', ultimos4: '4444', caducidad: '09/2030' } };

test('«guardada» solo con un 2xx que lo diga', () => {
  assert.deepEqual(leerConfirmacionTarjeta(200, null, GUARDADA), {
    tipo: 'guardada', tarjeta: { marca: 'mastercard', ultimos4: '4444', caducidad: '09/2030' },
  });
});

test('⚠️ nada optimista: confirmando, sin completar, un 404, un 500 o un cuerpo raro son «en proceso»', () => {
  for (const [status, cuerpo] of [
    [200, { confirmacion: 'confirmando', tarjeta: null }],
    [200, { confirmacion: 'sin_completar', tarjeta: null }],
    [404, { error: 'No encontrada' }],
    [500, GUARDADA],
    [502, null],
    [200, 'guardada'],
    [200, {}],
  ] as const) {
    assert.deepEqual(leerConfirmacionTarjeta(status, null, cuerpo), { tipo: 'en_proceso' }, `${status} ${JSON.stringify(cuerpo)}`);
  }
});

test('sesión caducada o segundo paso pendiente: se dice, no se sigue preguntando', () => {
  assert.deepEqual(leerConfirmacionTarjeta(401, null, { error: 'x' }), { tipo: 'sesion' });
  assert.deepEqual(leerConfirmacionTarjeta(401, null, { codigo: 'doble_factor_requerido' }), { tipo: 'dos-pasos' });
});

test('un 429 alarga la espera con su Retry-After', () => {
  const r = leerConfirmacionTarjeta(429, '9', { error: 'x' });
  assert.equal(r.tipo, 'en_proceso');
  assert.ok(r.tipo === 'en_proceso' && (r.esperaMinMs ?? 0) >= 9000);
});

test('la espera se acaba (no pregunta para siempre)', () => {
  let n = 0;
  while (esperaAntesDe(n) != null) n++;
  assert.ok(n > 3 && n < 40);
});

test('lo que se enseña: marca y cuatro dígitos de la ficha', () => {
  assert.equal(textoTarjeta({ marca: 'mastercard', ultimos4: '4444', caducidad: null }), 'Mastercard •••• 4444');
  assert.equal(textoTarjeta({ marca: null, ultimos4: '4444', caducidad: null }), '•••• 4444');
  assert.equal(textoTarjeta({ marca: 'visa', ultimos4: null, caducidad: null }), 'Tu tarjeta');
});

test('el consentimiento en una línea: dice que el estudio cobrará solas sus cuotas y lo pendiente', () => {
  const l = lineaConsentimiento('Estudio Alma');
  assert.match(l, /^Al guardarla, Estudio Alma podrá cobrarte en ella tus cuotas y lo que tengas pendiente/);
  assert.match(lineaConsentimiento(''), /el estudio podrá cobrarte/);
});

test('⚠️ con sus cuotas por domiciliación, no promete cobrarlas con la tarjeta', () => {
  const l = lineaConsentimiento('Estudio Alma', { domiciliacion: true });
  assert.match(l, /domiciliación bancaria/);
  assert.doesNotMatch(l, /podrá cobrarte en ella tus cuotas/);
});
