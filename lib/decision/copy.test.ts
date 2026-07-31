import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseConfianza } from './copy.ts';

test('fraseConfianza: nunca devuelve la etiqueta cruda ALTA/MEDIA/BAJA', () => {
  for (const nivel of ['ALTA', 'MEDIA', 'BAJA'] as const) {
    const frase = fraseConfianza(nivel);
    assert.notEqual(frase, nivel);
    assert.ok(frase.length > 0);
  }
});

test('fraseConfianza: ALTA es la frase de mayor seguridad', () => {
  assert.equal(fraseConfianza('ALTA'), 'Estoy bastante segura.');
});
