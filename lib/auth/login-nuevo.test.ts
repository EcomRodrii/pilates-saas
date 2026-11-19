import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginNuevoVisible } from './login-nuevo.ts';

test('apagado de serie y con valores raros', () => {
  assert.equal(loginNuevoVisible(undefined, undefined), false);
  assert.equal(loginNuevoVisible('', 'nuevo'), false);
  assert.equal(loginNuevoVisible('si', 'nuevo'), false);
});
test('«on»: todos', () => {
  assert.equal(loginNuevoVisible('on', undefined), true);
  assert.equal(loginNuevoVisible(' ON ', undefined), true);
});
test('«prueba»: solo con ?login=nuevo', () => {
  assert.equal(loginNuevoVisible('prueba', undefined), false);
  assert.equal(loginNuevoVisible('prueba', 'viejo'), false);
  assert.equal(loginNuevoVisible('prueba', 'nuevo'), true);
  assert.equal(loginNuevoVisible('prueba', ['nuevo']), true);
});
