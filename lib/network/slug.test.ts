import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarSlug, slugBase, slugConSufijo } from './slug.ts';

test('normalizarSlug: quita acentos y pasa a minúsculas con guiones', () => {
  assert.equal(normalizarSlug('María García'), 'maria-garcia');
  assert.equal(normalizarSlug('  Espacios   Sueltos  '), 'espacios-sueltos');
  assert.equal(normalizarSlug('Ñoño & Cía.'), 'nono-cia');
});

test('slugBase: combina nombre y ciudad', () => {
  assert.equal(slugBase('María García', 'Barcelona'), 'maria-garcia-barcelona');
});

test('slugBase: sin ciudad, solo el nombre', () => {
  assert.equal(slugBase('María García', null), 'maria-garcia');
});

test('slugBase: nombre vacío no rompe, cae a un valor por defecto', () => {
  assert.equal(slugBase('', null), 'instructora');
  assert.equal(slugBase('   ', ''), 'instructora');
});

test('slugConSufijo: primer intento sin sufijo, siguientes numerados', () => {
  assert.equal(slugConSufijo('maria-garcia', 1), 'maria-garcia');
  assert.equal(slugConSufijo('maria-garcia', 2), 'maria-garcia-2');
  assert.equal(slugConSufijo('maria-garcia', 5), 'maria-garcia-5');
});
