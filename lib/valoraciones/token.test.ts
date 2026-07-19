import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarTokenValoracion, verificarTokenValoracion } from './token.ts';

process.env.SUSTITUCION_TOKEN_SECRET ??= 'test-secret-valoraciones';
const AHORA = 1_700_000_000_000;

test('roundtrip: firma y verifica devolviendo el claim', () => {
  const t = firmarTokenValoracion('studio-1', 'soc-9', 'ses-7', AHORA);
  const claim = verificarTokenValoracion(t, AHORA);
  assert.deepEqual(claim, { studioId: 'studio-1', socioId: 'soc-9', sesionId: 'ses-7' });
});

test('token caducado → null', () => {
  const t = firmarTokenValoracion('studio-1', 'soc-9', 'ses-7', AHORA);
  const muyDespues = AHORA + 15 * 24 * 60 * 60 * 1000; // > TTL 14d
  assert.equal(verificarTokenValoracion(t, muyDespues), null);
});

test('firma manipulada → null', () => {
  const t = firmarTokenValoracion('studio-1', 'soc-9', 'ses-7', AHORA);
  const [payload] = t.split('.');
  assert.equal(verificarTokenValoracion(`${payload}.firmafalsa`, AHORA), null);
});

test('payload manipulado (otra sesión) → null (firma no cuadra)', () => {
  const t = firmarTokenValoracion('studio-1', 'soc-9', 'ses-7', AHORA);
  const sig = t.split('.')[1];
  const otro = Buffer.from(JSON.stringify({ studioId: 'studio-1', socioId: 'soc-9', sesionId: 'ses-OTRA', scope: 'valorar', exp: AHORA + 1000 })).toString('base64url');
  assert.equal(verificarTokenValoracion(`${otro}.${sig}`, AHORA), null);
});

test('basura → null', () => {
  assert.equal(verificarTokenValoracion('', AHORA), null);
  assert.equal(verificarTokenValoracion('sinpunto', AHORA), null);
  assert.equal(verificarTokenValoracion(null, AHORA), null);
});
