import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mismoToken } from './enlaces.ts';

test('el mismo token es igual a sí mismo', () => {
  assert.equal(mismoToken('abc.def', 'abc.def'), true);
});

test('tokens de contenido distinto (misma longitud) → false', () => {
  assert.equal(mismoToken('abc.def', 'abc.xyz'), false);
});

test('tokens de longitud distinta → false (sin comparar byte a byte)', () => {
  assert.equal(mismoToken('abc', 'abc.mas.largo'), false);
});

test('cadenas vacías se consideran iguales entre sí', () => {
  assert.equal(mismoToken('', ''), true);
});
