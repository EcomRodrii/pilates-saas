import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primerError } from './primer-error.ts';

test('sin errores → null', () => {
  assert.equal(primerError([{ error: null }, { error: undefined }, {}], ['a', 'b', 'c']), null);
});

test('devuelve el PRIMER fallo con el nombre de su consulta', () => {
  const r = primerError([{ error: null }, { error: { message: 'timeout' } }, { error: { message: 'otro' } }], ['tipos_clase', 'salas', 'spots']);
  assert.equal(r, 'salas: timeout');
});

test('las consultas saltadas (undefined, modo liviano) no cuentan', () => {
  assert.equal(primerError([undefined, null, { error: null }], ['a', 'b', 'c']), null);
});

test('un error sin mensaje sigue siendo un error', () => {
  assert.equal(primerError([{ error: {} }], ['x']), 'x: error sin mensaje');
});
