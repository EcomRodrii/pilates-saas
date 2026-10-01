import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cupoEfectivo, leerPlazasCedidas } from './cupo.ts';

test('manda la excepción de la sesión, luego la del tipo, y si no hay ninguna no hay límite', () => {
  assert.equal(cupoEfectivo(1, 3), 1);
  assert.equal(cupoEfectivo(0, 3), 0);
  assert.equal(cupoEfectivo(null, 3), 3);
  assert.equal(cupoEfectivo(undefined, undefined), null);
});

test('el campo en blanco quita el límite; un entero lo pone', () => {
  assert.deepEqual(leerPlazasCedidas('  ', 10), { ok: true, plazas: null });
  assert.deepEqual(leerPlazasCedidas('2', 10), { ok: true, plazas: 2 });
  assert.deepEqual(leerPlazasCedidas('0', 10), { ok: true, plazas: 0 });
});

test('rechaza lo que no es un entero o pasa del aforo de la clase', () => {
  assert.equal(leerPlazasCedidas('2,5', 10).ok, false);
  assert.equal(leerPlazasCedidas('-1', 10).ok, false);
  const r = leerPlazasCedidas('12', 10);
  assert.ok(!r.ok);
  assert.match(r.error, /12.*10/);
  assert.deepEqual(leerPlazasCedidas('12', null), { ok: true, plazas: 12 });
});
