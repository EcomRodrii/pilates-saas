import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.OAUTH_STATE_SECRET ??= 'test-secret-solo-para-este-test';

const { firmarBajaMarketing, verificarBajaMarketing } = await import('./unsubscribe-token.ts');

test('firmar + verificar: token válido devuelve studioId/socioId', () => {
  const token = firmarBajaMarketing('e1', 's1');
  const r = verificarBajaMarketing(token);
  assert.deepEqual(r, { studioId: 'e1', socioId: 's1' });
});

test('verificar: token manipulado (firma no coincide) → null', () => {
  const token = firmarBajaMarketing('e1', 's1');
  const manipulado = token.slice(0, -2) + 'xx';
  assert.equal(verificarBajaMarketing(manipulado), null);
});

test('verificar: token de otra socia no cuela para esta (no hay confusión de ids)', () => {
  const tokenOtra = firmarBajaMarketing('e1', 'otra-socia');
  const r = verificarBajaMarketing(tokenOtra);
  assert.notEqual(r?.socioId, 's1');
});

test('verificar: null/undefined/vacío → null, sin lanzar', () => {
  assert.equal(verificarBajaMarketing(null), null);
  assert.equal(verificarBajaMarketing(undefined), null);
  assert.equal(verificarBajaMarketing(''), null);
  assert.equal(verificarBajaMarketing('basura-sin-punto'), null);
});
