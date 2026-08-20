import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitosDeTextoPegado, codigoCompleto, formatearCuentaAtras } from './otp-utils.ts';

test('digitosDeTextoPegado: pegar "482913" lo distribuye en 6 posiciones', () => {
  assert.deepEqual(digitosDeTextoPegado('482913'), ['4', '8', '2', '9', '1', '3']);
});

test('digitosDeTextoPegado: ignora separadores (espacios, guiones)', () => {
  assert.deepEqual(digitosDeTextoPegado('482 913'), ['4', '8', '2', '9', '1', '3']);
  assert.deepEqual(digitosDeTextoPegado('482-913'), ['4', '8', '2', '9', '1', '3']);
});

test('digitosDeTextoPegado: extrae el código aunque venga dentro de una frase (pegar el email completo)', () => {
  assert.deepEqual(
    digitosDeTextoPegado('Tu código de verificación es: 482913. Caduca en 10 minutos.'),
    ['4', '8', '2', '9', '1', '3'],
  );
});

test('digitosDeTextoPegado: menos de 6 dígitos rellena el resto vacío, nunca lanza', () => {
  assert.deepEqual(digitosDeTextoPegado('42'), ['4', '2', '', '', '', '']);
  assert.deepEqual(digitosDeTextoPegado(''), ['', '', '', '', '', '']);
});

test('digitosDeTextoPegado: más de 6 dígitos se recorta a la longitud pedida', () => {
  assert.deepEqual(digitosDeTextoPegado('123456789'), ['1', '2', '3', '4', '5', '6']);
});

test('codigoCompleto: 6 dígitos rellenos da el código', () => {
  assert.equal(codigoCompleto(['4', '8', '2', '9', '1', '3']), '482913');
});

test('codigoCompleto: cualquier posición vacía da null', () => {
  assert.equal(codigoCompleto(['4', '8', '2', '9', '1', '']), null);
  assert.equal(codigoCompleto(['', '', '', '', '', '']), null);
});

test('formatearCuentaAtras: formatea mm:ss con ceros a la izquierda', () => {
  assert.equal(formatearCuentaAtras(42), '00:42');
  assert.equal(formatearCuentaAtras(65), '01:05');
  assert.equal(formatearCuentaAtras(0), '00:00');
});

test('formatearCuentaAtras: nunca negativo, aunque el reloj se pase', () => {
  assert.equal(formatearCuentaAtras(-5), '00:00');
});
