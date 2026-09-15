import { test } from 'node:test';
import assert from 'node:assert';
import { normalizarEmail, normalizarTelefono, extraerDominio } from './leads.ts';

test('normalizarEmail', () => {
  assert.strictEqual(normalizarEmail('MARCOS@TENTARE.APP'), 'marcos@tentare.app');
  assert.strictEqual(normalizarEmail('  test@example.com  '), 'test@example.com');
});

test('normalizarTelefono', () => {
  // E.164 formato
  assert.strictEqual(normalizarTelefono('34 123 456 789'), '+34123456789');
  assert.strictEqual(normalizarTelefono('0034 123 456 789'), '+34123456789');
  assert.strictEqual(normalizarTelefono('0123 456 789'), '+34123456789');
  assert.strictEqual(normalizarTelefono('+34 123 456 789'), '+34123456789');
  assert.strictEqual(normalizarTelefono(null), null);
  assert.strictEqual(normalizarTelefono(''), null);
  assert.strictEqual(normalizarTelefono(undefined), null);
});

test('extraerDominio', () => {
  assert.strictEqual(extraerDominio('https://example.com'), 'example.com');
  assert.strictEqual(extraerDominio('http://example.com/path'), 'example.com');
  assert.strictEqual(extraerDominio('example.com'), 'example.com');
  assert.strictEqual(extraerDominio('EXAMPLE.COM'), 'example.com');
  assert.strictEqual(extraerDominio(''), null);
  assert.strictEqual(extraerDominio(null), null);
  assert.strictEqual(extraerDominio(undefined), null);
});
