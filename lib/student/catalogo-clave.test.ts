import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANONIMA, borrarPorSlug, claveCatalogo } from './catalogo-clave.ts';

test('el payload de A no es el de B: misma tienda, claves distintas por persona', () => {
  assert.notEqual(claveCatalogo('alma', 'user-a'), claveCatalogo('alma', 'user-b'));
  assert.equal(claveCatalogo('alma', 'user-a'), claveCatalogo('alma', 'user-a'));
});

test('anónima es una identidad aparte (el payload sin sesión no lleva socia)', () => {
  assert.equal(claveCatalogo('alma', null), `alma|${ANONIMA}`);
  assert.equal(claveCatalogo('alma', undefined), claveCatalogo('alma', ''));
  assert.notEqual(claveCatalogo('alma', null), claveCatalogo('alma', 'user-a'));
});

test('invalidar un estudio borra las entradas de todas las personas, y solo de ese estudio', () => {
  const m = new Map<string, number>([[claveCatalogo('alma', 'a'), 1], [claveCatalogo('alma', 'b'), 2], [claveCatalogo('alma', null), 3], [claveCatalogo('otro', 'a'), 4]]);
  assert.equal(borrarPorSlug(m, 'alma'), 3);
  assert.deepEqual([...m.keys()], [claveCatalogo('otro', 'a')]);
});
