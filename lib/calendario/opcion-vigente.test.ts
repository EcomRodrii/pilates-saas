import test from 'node:test';
import assert from 'node:assert/strict';
import { opcionVigente } from './opcion-vigente.ts';

const ops = [{ id: 'ins-a' }, { id: 'ins-b' }];

test('opcionVigente: conserva la elegida si sigue entre las opciones', () => {
  assert.equal(opcionVigente('ins-b', ops), 'ins-b');
});
test('opcionVigente: un id que ya no existe cae a la primera opción, la que enseña el select', () => {
  assert.equal(opcionVigente('ins-borrada', ops), 'ins-a');
});
test('opcionVigente: un id vacío cae a la primera opción', () => {
  assert.equal(opcionVigente('', ops), 'ins-a');
});
test('opcionVigente: sin opciones devuelve vacío (y el formulario bloquea el envío)', () => {
  assert.equal(opcionVigente('ins-a', []), '');
});
