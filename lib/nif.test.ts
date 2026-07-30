// Tests del validador de NIF emisor (F0 · CFG-1). Runner nativo: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nifEmisorValido, nifValido } from './nif.ts';

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

// nifValido: dígito/letra de control real (no solo formato). Sin esta cobertura,
// un cambio futuro en el algoritmo podría romper el checksum sin que nada lo
// detecte — justo el código que protege la calidad del dato antes de firmar y
// enviar una factura Veri*Factu a la AEAT.
test('nifValido: DNI con letra de control correcta/incorrecta', () => {
  assert.ok(nifValido('12345678Z'));   // letra real, ejemplo estándar
  assert.ok(nifValido('00000000T'));
  assert.equal(nifValido('12345678A'), false); // letra equivocada (la correcta es Z)
});

test('nifValido: NIE con los tres prefijos (X/Y/Z cuentan como 0/1/2)', () => {
  assert.ok(nifValido('X1234567L'));
  assert.ok(nifValido('Y1234567X'));
  assert.ok(nifValido('Z1234567R'));
  assert.equal(nifValido('X1234567A'), false); // letra equivocada
});

test('nifValido: CIF acepta control por dígito o por letra según le corresponda', () => {
  assert.ok(nifValido('B12345674')); // control dígito: '4'
  assert.ok(nifValido('B1234567D')); // misma suma, control letra: 'D' (también válido)
  assert.equal(nifValido('B12345671'), false); // dígito equivocado
});

test('nifValido: normaliza espacios, puntos y guiones antes de validar', () => {
  assert.ok(nifValido(' 12345678-Z '));
  assert.ok(nifValido('12.345.678-Z'));
  assert.ok(nifValido('12345678z')); // minúscula
});

test('nifValido: rechaza formato inválido, vacío o nulo', () => {
  assert.equal(nifValido(''), false);
  assert.equal(nifValido(null), false);
  assert.equal(nifValido(undefined), false);
  assert.equal(nifValido('HOLA'), false);
  assert.equal(nifValido('1234567Z'), false); // solo 7 dígitos
});
