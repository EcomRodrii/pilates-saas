import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cifrarIban, clavesIbanDelEntorno, descifrarIban, ibanLimpio, ultimos4 } from './iban-cifrado.ts';

const clave = randomBytes(32);
const claves = { actual: clave, anterior: null, malformada: false };
const IBAN = 'ES91 2100 0418 4502 0005 1332';

test('se cifra, no se ve, y se descifra con el mismo estudio y mandato', () => {
  const c = cifrarIban(IBAN, 'studio-a', 'mnd-1', claves);
  assert.ok(c && c.startsWith('enc:v1:'));
  assert.ok(!c.includes('2100'));
  assert.equal(descifrarIban(c, 'studio-a', 'mnd-1', claves), ibanLimpio(IBAN));
  // Copiado a otro mandato u otro estudio, no vale.
  assert.equal(descifrarIban(c, 'studio-a', 'mnd-2', claves), null);
  assert.equal(descifrarIban(c, 'studio-b', 'mnd-1', claves), null);
});

test('falla cerrado: sin clave no se cifra y un valor en claro no se da por bueno', () => {
  assert.equal(cifrarIban(IBAN, 's', 'm', { actual: null, anterior: null, malformada: false }), null);
  assert.equal(cifrarIban(IBAN, 's', 'm', { actual: clave, anterior: null, malformada: true }), null);
  assert.equal(descifrarIban(ibanLimpio(IBAN), 's', 'm', claves), null);
});

test('últimos 4 y clave del entorno', () => {
  assert.equal(ultimos4(IBAN), '1332');
  assert.equal(clavesIbanDelEntorno({ SEPA_CLAVE_CIFRADO: clave.toString('base64') }).actual?.equals(clave), true);
  assert.equal(clavesIbanDelEntorno({ SEPA_CLAVE_CIFRADO: 'x' }).malformada, true);
});
