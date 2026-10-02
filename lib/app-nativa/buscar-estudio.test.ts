import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoBusquedaEstudio } from './buscar-estudio.ts';

test('menos de 3 letras no busca: devolvería medio catálogo', () => {
  assert.equal(textoBusquedaEstudio(''), null);
  assert.equal(textoBusquedaEstudio('  ab '), null);
  assert.equal(textoBusquedaEstudio(null), null);
});

test('limpia espacios y corta a 60', () => {
  assert.equal(textoBusquedaEstudio('  zen   pilates '), 'zen pilates');
  assert.equal(textoBusquedaEstudio('x'.repeat(80))?.length, 60);
});
