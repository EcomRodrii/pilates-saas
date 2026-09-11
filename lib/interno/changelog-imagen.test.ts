import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlImagenCambioValida, normalizarUrlImagenCambio } from './changelog-imagen.ts';

const SUPA = 'https://dwqvdycjcffqwfkzapvi.supabase.co';

const NUESTRA = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/changelog-media/2026-09-11/abc.webp';

test('acepta una URL de nuestro bucket', () => {
  assert.equal(urlImagenCambioValida(NUESTRA, SUPA), true);
});

test('vacío y null son válidos: casi ningún cambio lleva imagen', () => {
  assert.equal(urlImagenCambioValida(null, SUPA), true);
  assert.equal(urlImagenCambioValida('', SUPA), true);
  assert.equal(urlImagenCambioValida('   ', SUPA), true);
});

test('rechaza un dominio ajeno aunque sea https', () => {
  // El riesgo real: cada apertura del changelog en cualquier estudio se
  // convierte en una baliza para ese tercero, y la imagen deja de ser nuestra.
  assert.equal(urlImagenCambioValida('https://ejemplo.com/changelog-media/x.png', SUPA), false);
  assert.equal(urlImagenCambioValida('https://cdn.ajeno.io/foto.png', SUPA), false);
});

test('rechaza http, javascript: y data:', () => {
  assert.equal(urlImagenCambioValida(NUESTRA.replace('https:', 'http:'), SUPA), false);
  assert.equal(urlImagenCambioValida('javascript:alert(1)', SUPA), false);
  assert.equal(urlImagenCambioValida('data:image/png;base64,iVBORw0KGgo=', SUPA), false);
});

test('rechaza lo que no es una URL', () => {
  assert.equal(urlImagenCambioValida('changelog-media/x.png', SUPA), false);
  assert.equal(urlImagenCambioValida('vaya cosa', SUPA), false);
});

test('no se cuela otro bucket cuyo nombre EMPIECE igual', () => {
  // `/changelog-media-falso/` no contiene `/changelog-media/`.
  assert.equal(urlImagenCambioValida(`${SUPA}/storage/v1/object/public/changelog-media-falso/a.png`, SUPA), false);
});

test('normalizar deja null y no cadena vacía', () => {
  assert.equal(normalizarUrlImagenCambio('  '), null);
  assert.equal(normalizarUrlImagenCambio(null), null);
  assert.equal(normalizarUrlImagenCambio(` ${NUESTRA} `), NUESTRA);
});

test('sin saber cuál es nuestro origen, no se aprueba ninguna URL', () => {
  // Fail-CLOSED: si falta NEXT_PUBLIC_SUPABASE_URL, aprobar por defecto sería
  // aceptar cualquier dominio justo cuando no hay con qué compararlo.
  assert.equal(urlImagenCambioValida(NUESTRA, ''), false);
  // Salvo el caso vacío, que no pinta ninguna imagen y por tanto no arriesga nada.
  assert.equal(urlImagenCambioValida('', ''), true);
});

test('una barra de más en la URL del proyecto no invalida la imagen', () => {
  assert.equal(urlImagenCambioValida(NUESTRA, `${SUPA}/`), true);
});
