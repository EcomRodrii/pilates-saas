import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCuentaDeRevision } from './cuenta-revision.ts';

test('sin variable, ninguna cuenta es de revisión', () => {
  assert.equal(esCuentaDeRevision('demo@example.com', undefined), false);
  assert.equal(esCuentaDeRevision('demo@example.com', ''), false);
});

test('reconoce la cuenta sin importar mayúsculas ni espacios, y solo esa', () => {
  const lista = ' Demo@Example.com , otra@example.com ';
  assert.equal(esCuentaDeRevision('demo@example.com', lista), true);
  assert.equal(esCuentaDeRevision('  DEMO@example.com ', lista), true);
  assert.equal(esCuentaDeRevision('otra@example.com', lista), true);
  assert.equal(esCuentaDeRevision('alguien@example.com', lista), false);
  assert.equal(esCuentaDeRevision('', lista), false);
  // Un trozo del email no vale.
  assert.equal(esCuentaDeRevision('demo@example', lista), false);
});
