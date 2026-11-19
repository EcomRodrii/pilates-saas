import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginNuevoVisible } from './login-nuevo.ts';

test('abierto de serie: sin variable, vacía o «on», lo ve todo el mundo', () => {
  assert.equal(loginNuevoVisible(undefined, undefined), true);
  assert.equal(loginNuevoVisible('', undefined), true);
  assert.equal(loginNuevoVisible(' ON ', undefined), true);
});
test('«off»: el de siempre, también con ?login=nuevo', () => {
  assert.equal(loginNuevoVisible('off', undefined), false);
  assert.equal(loginNuevoVisible(' OFF ', 'nuevo'), false);
});
test('«prueba» (el modo de antes) ya no lo esconde: lo ve todo el mundo', () => {
  assert.equal(loginNuevoVisible('prueba', undefined), true);
  assert.equal(loginNuevoVisible('prueba', 'nuevo'), true);
  assert.equal(loginNuevoVisible('prueba', ['nuevo']), true);
});
test('?login=viejo enseña el de siempre para comparar, salvo con «on»', () => {
  assert.equal(loginNuevoVisible(undefined, 'viejo'), false);
  assert.equal(loginNuevoVisible('prueba', 'viejo'), false);
  assert.equal(loginNuevoVisible('on', 'viejo'), true);
});
