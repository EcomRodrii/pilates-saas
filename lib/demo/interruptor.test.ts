import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDemo } from './interruptor.ts';

test('apagada de serie y con cualquier valor raro', () => {
  for (const v of [undefined, '', 'off', 'true', '1', 'ON ?', 'estudios:abc']) {
    assert.deepEqual(estadoDemo(v, true), { pagina: false, boton: false, api: false }, String(v));
  }
});
test('on: todo abierto, sin importar el parámetro', () => {
  assert.deepEqual(estadoDemo('on'), { pagina: true, boton: true, api: true });
  assert.deepEqual(estadoDemo(' ON ', true), { pagina: true, boton: true, api: true });
});
test('prueba: la página solo con el parámetro y el botón nunca', () => {
  assert.deepEqual(estadoDemo('prueba'), { pagina: false, boton: false, api: true });
  assert.deepEqual(estadoDemo('prueba', true), { pagina: true, boton: false, api: true });
});
