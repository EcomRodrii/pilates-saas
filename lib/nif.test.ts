// Tests del validador de NIF emisor (F0 · CFG-1). Runner nativo: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nifEmisorValido } from './nif.ts';

test('acepta DNI / NIE / CIF con forma válida (no de relleno)', () => {
  assert.ok(nifEmisorValido('46852368N'));   // DNI
  assert.ok(nifEmisorValido('X4567890L'));    // NIE
  assert.ok(nifEmisorValido('B98765432'));    // CIF (control dígito)
  assert.ok(nifEmisorValido('G7654321J'));    // CIF (control letra)
  assert.ok(nifEmisorValido(' b98765432 '));  // se normaliza (trim + mayúsculas)
});

test('rechaza vacío / nulo / basura', () => {
  assert.equal(nifEmisorValido(''), false);
  assert.equal(nifEmisorValido(null), false);
  assert.equal(nifEmisorValido(undefined), false);
  assert.equal(nifEmisorValido('111'), false);
  assert.equal(nifEmisorValido('HOLA'), false);
});

test('rechaza el relleno del demo y secuencias obvias', () => {
  assert.equal(nifEmisorValido('B12345678'), false); // el filler del estudio demo
  assert.equal(nifEmisorValido('12345678A'), false);
  assert.equal(nifEmisorValido('00000000T'), false);
  assert.equal(nifEmisorValido('A11111111'), false);
});
