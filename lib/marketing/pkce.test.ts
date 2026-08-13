import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { generarPkce } from './pkce.ts';

// PKCE (RFC 7636) — lo único de la integración Klaviyo (lib/klaviyo.ts)
// verificable sin credenciales reales (el resto son llamadas HTTP a una API
// externa, ver la nota de "NO VERIFICADO end-to-end" en ese archivo). Esto sí
// se puede comprobar: la forma exacta que exige el estándar.

test('generarPkce: code_verifier tiene entre 43 y 128 caracteres (RFC 7636)', () => {
  const { codeVerifier } = generarPkce();
  assert.ok(codeVerifier.length >= 43 && codeVerifier.length <= 128, `longitud fuera de rango: ${codeVerifier.length}`);
});

test('generarPkce: code_verifier solo usa el alfabeto unreserved de RFC 7636', () => {
  const { codeVerifier } = generarPkce();
  assert.match(codeVerifier, /^[A-Za-z0-9\-._~]+$/);
});

test('generarPkce: code_challenge es SHA-256(code_verifier) en base64url', () => {
  const { codeVerifier, codeChallenge } = generarPkce();
  const esperado = createHash('sha256').update(codeVerifier).digest('base64url');
  assert.equal(codeChallenge, esperado);
});

test('generarPkce: cada llamada genera un par distinto (nunca se reutiliza)', () => {
  const a = generarPkce();
  const b = generarPkce();
  assert.notEqual(a.codeVerifier, b.codeVerifier);
});
