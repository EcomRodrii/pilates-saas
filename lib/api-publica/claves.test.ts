import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarClaveApi, hashClaveApi, esClaveApi, PREFIJO_CLAVE } from './claves.ts';

test('una clave nueva: prefijo reconocible, hash SHA-256 y prefijo visible corto', () => {
  const k = generarClaveApi();
  assert.ok(k.clave.startsWith(PREFIJO_CLAVE));
  assert.ok(esClaveApi(k.clave));
  assert.match(k.hash, /^[0-9a-f]{64}$/);
  assert.equal(k.hash, hashClaveApi(k.clave));
  assert.ok(k.clave.startsWith(k.prefijo) && k.prefijo.length < k.clave.length - 20, 'el prefijo no revela la clave');
});

test('dos claves nunca coinciden', () => {
  const vistas = new Set(Array.from({ length: 200 }, () => generarClaveApi().clave));
  assert.equal(vistas.size, 200);
});

test('un token OAuth o basura no se toma por clave', () => {
  assert.equal(esClaveApi('abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123'), false);
  assert.equal(esClaveApi('tnt_sk_corta'), false);
  assert.equal(esClaveApi(`tnt_sk_${'a'.repeat(43)}x`), false);
  assert.equal(esClaveApi(`tnt_sk_${'a'.repeat(43)}`), true);
});
