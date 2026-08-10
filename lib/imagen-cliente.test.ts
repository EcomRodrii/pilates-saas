import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeIntentarReducir, LADO_AVATAR, LADO_FOTO_CLASE, LADO_BANNER } from './imagen-cliente.ts';

// Lo que se prueba aquí es la GUARDA DE FORMATOS, no el redimensionado en sí:
// el resto necesita canvas y no existe fuera del navegador. Es justo la parte
// donde un error sería silencioso y destructivo (un SVG rasterizado o un GIF
// congelado se suben sin dar ningún error), así que es la que merece test.

test('no toca SVG: rasterizarlo perdería el vector del logo del estudio', () => {
  assert.equal(debeIntentarReducir('image/svg+xml'), false);
});

test('no toca GIF: pasarlo por canvas dejaría solo el primer fotograma', () => {
  assert.equal(debeIntentarReducir('image/gif'), false);
});

test('no toca lo que no es imagen', () => {
  for (const t of ['application/pdf', 'text/plain', 'application/octet-stream', '']) {
    assert.equal(debeIntentarReducir(t), false, t);
  }
});

test('sí reduce los formatos de foto habituales de un móvil', () => {
  for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']) {
    assert.equal(debeIntentarReducir(t), true, t);
  }
});

test('los lados máximos van de menor a mayor según cuánto ocupa cada cosa en pantalla', () => {
  // Un avatar se pinta recortado en un círculo pequeño; un banner, a ancho
  // completo. Si esto se invirtiera por descuido, los avatares pesarían de más.
  assert.ok(LADO_AVATAR < LADO_FOTO_CLASE, 'el avatar no puede pedir más lado que la foto de clase');
  assert.ok(LADO_FOTO_CLASE < LADO_BANNER, 'la foto de clase no puede pedir más lado que el banner');
});
