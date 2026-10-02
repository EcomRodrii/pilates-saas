import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generarNonce, prepararNonceApple, sha256Hex } from './nonce.ts';

test('generarNonce: 64 caracteres hex por defecto y distinto cada vez', () => {
  const a = generarNonce();
  const b = generarNonce();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.match(generarNonce(16), /^[0-9a-f]{32}$/);
});

test('generarNonce: sale de la fuente aleatoria, no de Math.random', () => {
  const fija = { getRandomValues: <T extends ArrayBufferView | null>(a: T) => { new Uint8Array(a!.buffer).fill(0xab); return a; } };
  assert.equal(generarNonce(16, fija as Pick<Crypto, 'getRandomValues'>), 'ab'.repeat(16));
});

test('generarNonce: menos de 16 bytes no es un nonce', () => {
  assert.throws(() => generarNonce(8));
  assert.throws(() => generarNonce(0));
});

test('sha256Hex: vector conocido y el mismo valor que calcula Supabase', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const nonce = generarNonce();
  assert.equal(await sha256Hex(nonce), createHash('sha256').update(nonce).digest('hex'));
});

test('prepararNonceApple: a Apple va el hash del crudo, y el crudo no es el hash', async () => {
  const { crudo, hash } = await prepararNonceApple();
  assert.match(crudo, /^[0-9a-f]{64}$/);
  assert.equal(hash, createHash('sha256').update(crudo).digest('hex'));
  assert.notEqual(crudo, hash);
});
