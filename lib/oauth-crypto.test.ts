import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { generarPkce } from './marketing/pkce.ts';
import {
  generarTokenAleatorio, sha256Hex, compararEnTiempoConstante, verificarPkce, scopesValidos,
} from './oauth-crypto.ts';

test('generarTokenAleatorio: 32 bytes en base64url son al menos 43 caracteres, sin padding', () => {
  const t = generarTokenAleatorio();
  assert.ok(t.length >= 43);
  assert.doesNotMatch(t, /[=+/]/);
});

test('generarTokenAleatorio: dos llamadas nunca coinciden', () => {
  assert.notEqual(generarTokenAleatorio(), generarTokenAleatorio());
});

test('sha256Hex: determinista y coincide con crypto nativo', () => {
  assert.equal(sha256Hex('hola'), createHash('sha256').update('hola').digest('hex'));
});

test('compararEnTiempoConstante: iguales → true, distintos → false, longitudes distintas → false', () => {
  assert.equal(compararEnTiempoConstante('abc', 'abc'), true);
  assert.equal(compararEnTiempoConstante('abc', 'abd'), false);
  assert.equal(compararEnTiempoConstante('abc', 'abcd'), false);
});

test('verificarPkce: acepta un par code_verifier/code_challenge real de generarPkce()', () => {
  const { codeVerifier, codeChallenge } = generarPkce();
  assert.equal(verificarPkce(codeVerifier, codeChallenge), true);
});

test('verificarPkce: rechaza un code_verifier que no corresponde al challenge', () => {
  const a = generarPkce();
  const b = generarPkce();
  assert.equal(verificarPkce(a.codeVerifier, b.codeChallenge), false);
});

test('verificarPkce: rechaza code_verifier fuera de longitud RFC 7636 (43-128)', () => {
  assert.equal(verificarPkce('corto', 'x'), false);
  assert.equal(verificarPkce('a'.repeat(200), 'x'), false);
});

test('scopesValidos: acepta lista de scopes reconocidos', () => {
  assert.equal(scopesValidos(['clientas:leer', 'reservas:leer']), true);
});

test('scopesValidos: rechaza lista vacía y scopes desconocidos', () => {
  assert.equal(scopesValidos([]), false);
  assert.equal(scopesValidos(['pagos:escribir']), false);
  assert.equal(scopesValidos(['clientas:leer', 'algo-inventado']), false);
});
