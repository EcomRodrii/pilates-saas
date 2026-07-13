import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarEstadoOAuth, verificarEstadoOAuth } from './oauth-state.ts';

process.env.OAUTH_STATE_SECRET = 'test-secret-123';
const NOW = 1_700_000_000_000;

test('round-trip: verifica el estado recién firmado y devuelve el studioId', () => {
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW);
  assert.deepEqual(verificarEstadoOAuth(s, 'stripe', NOW + 1000), { studioId: 'studio-A' });
});

test('rechaza firma manipulada', () => {
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW);
  const ult = s[s.length - 1];
  const tampered = s.slice(0, -1) + (ult === 'A' ? 'B' : 'A');
  assert.equal(verificarEstadoOAuth(tampered, 'stripe', NOW + 1000), null);
});

test('ATAQUE C-8: payload con otro studioId + firma original → rechazado', () => {
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW);
  const sig = s.slice(s.indexOf('.') + 1);
  const fakePayload = Buffer.from(
    JSON.stringify({ studioId: 'studio-VICTIMA', provider: 'stripe', exp: NOW + 999999 }),
  ).toString('base64url');
  assert.equal(verificarEstadoOAuth(`${fakePayload}.${sig}`, 'stripe', NOW + 1000), null);
});

test('rechaza proveedor cruzado (state de stripe usado en el callback de google)', () => {
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW);
  assert.equal(verificarEstadoOAuth(s, 'google', NOW + 1000), null);
});

test('rechaza estado caducado (>10 min)', () => {
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW);
  assert.equal(verificarEstadoOAuth(s, 'stripe', NOW + 11 * 60 * 1000), null);
});

test('rechaza null / vacío / sin separador', () => {
  assert.equal(verificarEstadoOAuth(null, 'stripe', NOW), null);
  assert.equal(verificarEstadoOAuth('', 'stripe', NOW), null);
  assert.equal(verificarEstadoOAuth('sinpunto', 'stripe', NOW), null);
});
