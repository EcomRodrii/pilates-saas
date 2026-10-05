import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCancelacion, formaDeCompartir, textoParaCopiar } from './compartir.ts';

test('formaDeCompartir: la app manda; en la web, la hoja del sistema si existe; si no, copiar', () => {
  assert.equal(formaDeCompartir({ nativa: true, hayWebShare: false }), 'nativa');
  assert.equal(formaDeCompartir({ nativa: true, hayWebShare: true }), 'nativa');
  assert.equal(formaDeCompartir({ nativa: false, hayWebShare: true }), 'web');
  assert.equal(formaDeCompartir({ nativa: false, hayWebShare: false }), 'copiar');
});

test('esCancelacion: cerrar la hoja no es un fallo', () => {
  const abort = new Error('Share canceled by the user');
  abort.name = 'AbortError';
  assert.equal(esCancelacion(abort), true);
  assert.equal(esCancelacion({ name: 'AbortError' }), true);
  assert.equal(esCancelacion(new Error('Share canceled')), true);
  assert.equal(esCancelacion('cancelled'), true);
  assert.equal(esCancelacion(new Error('NotAllowedError')), false);
  assert.equal(esCancelacion(null), false);
});

test('textoParaCopiar: el enlace va con la frase, sin repetirlo', () => {
  assert.equal(textoParaCopiar('¿Te vienes?', 'https://x.app/r'), '¿Te vienes?\nhttps://x.app/r');
  assert.equal(textoParaCopiar('Mira https://x.app/r', 'https://x.app/r'), 'Mira https://x.app/r');
  assert.equal(textoParaCopiar('Solo texto', null), 'Solo texto');
});
