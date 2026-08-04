import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RETOS_PORTAL, RETO_KEYS, esRetoKeyValida } from './retos-portal.ts';

test('RETOS_PORTAL: 2 retos fijos, calcados del prototipo', () => {
  assert.equal(RETOS_PORTAL.length, 2);
  assert.deepEqual(RETO_KEYS, ['core', 'cara']);
});

test('esRetoKeyValida: solo acepta las keys reales', () => {
  assert.equal(esRetoKeyValida('core'), true);
  assert.equal(esRetoKeyValida('cara'), true);
  assert.equal(esRetoKeyValida('no-existe'), false);
  assert.equal(esRetoKeyValida(''), false);
});
