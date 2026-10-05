import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoCaducado, enmascararCorreo, mensajeCodigoFallido, MINUTOS_CADUCIDAD_CODIGO } from './entrada-codigo.ts';

test('el correo se tapa por delante y deja el dominio entero, que es donde van las erratas', () => {
  assert.equal(enmascararCorreo('lucia@example.com'), 'lu•••@example.com');
  assert.equal(enmascararCorreo('  lucia@exmaple.com '), 'lu•••@exmaple.com');
  // Un local corto no se enseña casi entero.
  assert.equal(enmascararCorreo('ana@example.com'), 'a•••@example.com');
  assert.equal(enmascararCorreo('a@example.com'), 'a•••@example.com');
  // Sin arroba no hay nada que tapar con sentido: se enseña tal cual.
  assert.equal(enmascararCorreo('sin-arroba'), 'sin-arroba');
});

test('un código caduca a los 10 minutos de mandarlo, ni antes ni sin saber cuándo se mandó', () => {
  const t0 = Date.UTC(2026, 9, 5, 10, 0, 0);
  assert.equal(MINUTOS_CADUCIDAD_CODIGO, 10);
  assert.equal(codigoCaducado(t0, t0 + 9 * 60_000), false);
  assert.equal(codigoCaducado(t0, t0 + 10 * 60_000), false);
  assert.equal(codigoCaducado(t0, t0 + 10 * 60_000 + 1), true);
  // Sin hora de envío no se puede afirmar que haya caducado.
  assert.equal(codigoCaducado(null, t0), false);
});

test('código mal: dice cuántos intentos quedan SOLO si el servidor los cuenta', () => {
  assert.equal(mensajeCodigoFallido({ tipo: 'incorrecto', intentosRestantes: 4 }), 'Ese código no es. Te quedan 4 intentos.');
  assert.equal(mensajeCodigoFallido({ tipo: 'incorrecto', intentosRestantes: 1 }), 'Ese código no es. Te queda 1 intento.');
  assert.match(mensajeCodigoFallido({ tipo: 'incorrecto', intentosRestantes: 0 })!, /no te quedan más intentos/);
  // Sin el dato, no se inventa un número.
  const sinDato = mensajeCodigoFallido({ tipo: 'incorrecto', intentosRestantes: null })!;
  assert.doesNotMatch(sinDato, /\d/);
});

test('caducado: dice que ha caducado, y si ya salió otro, que use ese', () => {
  assert.equal(mensajeCodigoFallido({ tipo: 'caducado', reenviado: true }), 'Ha caducado. Te hemos mandado otro: usa el del último correo.');
  assert.match(mensajeCodigoFallido({ tipo: 'caducado', reenviado: false })!, /duran 10 minutos/);
});

test('lo demás (demasiados intentos, sin conexión) lo dice el servidor, no esta función', () => {
  assert.equal(mensajeCodigoFallido({ tipo: 'otro' }), null);
});
