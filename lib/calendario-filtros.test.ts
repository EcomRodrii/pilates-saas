import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseAtenuadaPorInstructor } from './calendario-filtros.ts';

test('sin filtro activo, nada se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i1', ''), false);
  assert.equal(claseAtenuadaPorInstructor(null, ''), false);
});

test('con filtro activo, la clase de la instructora elegida no se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i1', 'i1'), false);
});

test('con filtro activo, la clase de otra instructora se atenúa', () => {
  assert.equal(claseAtenuadaPorInstructor('i2', 'i1'), true);
});

test('con filtro activo, una clase sin instructora también se atenúa (no es la elegida)', () => {
  assert.equal(claseAtenuadaPorInstructor(null, 'i1'), true);
});
