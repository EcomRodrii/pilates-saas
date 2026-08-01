import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarTokenPreviewHome, verificarTokenPreviewHome } from './home-preview-token.ts';

process.env.HOME_PREVIEW_TOKEN_SECRET ??= 'test-secret-home-preview';
const AHORA = 1_700_000_000_000;
const MIN = 60 * 1000;

test('roundtrip: firma y verifica devolviendo el studioId', () => {
  const t = firmarTokenPreviewHome('studio-1', AHORA);
  assert.deepEqual(verificarTokenPreviewHome(t, AHORA), { studioId: 'studio-1' });
});

test('caduca a los 20 minutos', () => {
  const t = firmarTokenPreviewHome('studio-1', AHORA);
  assert.notEqual(verificarTokenPreviewHome(t, AHORA + 19 * MIN), null);
  assert.equal(verificarTokenPreviewHome(t, AHORA + 21 * MIN), null);
});

test('token manipulado (payload distinto, firma vieja) no vale', () => {
  const t = firmarTokenPreviewHome('studio-1', AHORA);
  const punto = t.indexOf('.');
  const payloadFalso = Buffer.from(JSON.stringify({ studioId: 'studio-OTRO', exp: AHORA + MIN })).toString('base64url');
  const manipulado = `${payloadFalso}.${t.slice(punto + 1)}`;
  assert.equal(verificarTokenPreviewHome(manipulado, AHORA), null);
});

test('null/undefined/vacío/basura → null, nunca lanza', () => {
  assert.equal(verificarTokenPreviewHome(null), null);
  assert.equal(verificarTokenPreviewHome(undefined), null);
  assert.equal(verificarTokenPreviewHome(''), null);
  assert.equal(verificarTokenPreviewHome('basura-sin-punto'), null);
  assert.equal(verificarTokenPreviewHome('a.b.c'), null);
});

test('un token de otro estudio no se confunde: studioId distinto, verificación propia', () => {
  const t1 = firmarTokenPreviewHome('studio-1', AHORA);
  const t2 = firmarTokenPreviewHome('studio-2', AHORA);
  assert.equal(verificarTokenPreviewHome(t1, AHORA)?.studioId, 'studio-1');
  assert.equal(verificarTokenPreviewHome(t2, AHORA)?.studioId, 'studio-2');
});
