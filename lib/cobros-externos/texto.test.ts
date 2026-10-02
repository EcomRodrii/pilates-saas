import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conceptoGuardable, datoGuardable, nombreFicheroGuardable, pagadorGuardable, referenciaGuardable, sinIban,
} from './texto.ts';

// Números INVENTADOS (IBAN con formato válido de ejemplo, tarjeta de pruebas).

test('un IBAN, con o sin espacios, no se guarda: quedan el país y los 4 últimos', () => {
  assert.equal(sinIban('TRANSF DE ES9121000418450200051332 CUOTA'), 'TRANSF DE ES··1332 CUOTA');
  assert.equal(sinIban('TRANSF DE ES91 2100 0418 4502 0005 1332 CUOTA'), 'TRANSF DE ES··1332 CUOTA');
  assert.equal(sinIban('IBAN GB29NWBK60161331926819'), 'IBAN GB··6819');
  // Palabras normales con letras y algún número no son un IBAN.
  assert.equal(sinIban('CUOTA OC2026 PILATES REFORMER'), 'CUOTA OC2026 PILATES REFORMER');
});

test('cualquier texto libre guardado pierde tarjetas e IBAN', () => {
  assert.equal(datoGuardable('PAGO 4111 1111 1111 1111 Y ES9121000418450200051332', 80), 'PAGO ···1111 Y ES··1332');
  assert.equal(conceptoGuardable('  BIZUM   CUOTA  '), 'BIZUM CUOTA');
  assert.equal(datoGuardable('', 80), null);
});

test('la referencia: el id de un recibo de Tentare se respeta aunque lleve 13 cifras; lo demás se sanea', () => {
  assert.equal(referenciaGuardable('rec-1727890000000-ab'), 'rec-1727890000000-ab');
  assert.equal(referenciaGuardable('4111111111111111'), '···1111');
  assert.equal(referenciaGuardable('ES9121000418450200051332'), 'ES··1332');
  assert.equal(referenciaGuardable('  '), null);
});

test('el pagador: solo letras; un número ahí es una cuenta o un documento', () => {
  assert.equal(pagadorGuardable('MARÍA GARCÍA 12345678Z'), 'maria garcia z');
  assert.equal(pagadorGuardable('0049 1234'), null);
});

test('el nombre del fichero: sin IBAN ni el número de cuenta', () => {
  assert.equal(nombreFicheroGuardable('extracto_ES9121000418450200051332_sep.n43'), 'extracto_ES··1332_sep.n43');
  assert.equal(nombreFicheroGuardable('C43_00491500051234567890.txt'), 'C43_···.txt');
  assert.equal(nombreFicheroGuardable('movimientos septiembre.csv'), 'movimientos septiembre.csv');
  assert.equal(nombreFicheroGuardable(null), null);
});
