import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITULO_ACCESO_POR_DEFECTO, renglonesDeAcceso, tituloDeAcceso } from './titulo-acceso.ts';

test('sin escribir nada se pinta el del producto, no un hueco', () => {
  for (const vacio of [null, undefined, '', '   ', '\n\n']) {
    assert.equal(tituloDeAcceso(vacio), TITULO_ACCESO_POR_DEFECTO);
  }
});

test('lo que escribe el estudio manda, con sus renglones', () => {
  assert.deepEqual(renglonesDeAcceso('Respira.\nEmpieza.'), ['Respira.', 'Empieza.']);
  // Un renglón en blanco en medio no deja un hueco vacío en la pantalla.
  assert.deepEqual(renglonesDeAcceso('Hola\n\n  mundo  '), ['Hola', 'mundo']);
  assert.deepEqual(renglonesDeAcceso(null), ['Muévete.', 'Lo demás,', 'ya está.']);
});
