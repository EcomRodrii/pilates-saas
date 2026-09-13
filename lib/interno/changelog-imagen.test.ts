import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlImagenCambioValida, normalizarUrlImagenCambio, tipoRealDeBytes } from './changelog-imagen.ts';

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

// M-4 (auditoría 58ª pasada): tipoRealDeBytes — la cabecera de verdad, no lo
// que declara el navegador.
test('reconoce un PNG por su cabecera', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
  assert.equal(tipoRealDeBytes(png), 'image/png');
});

test('reconoce un JPEG por su cabecera', () => {
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
  assert.equal(tipoRealDeBytes(jpeg), 'image/jpeg');
});

test('reconoce un WEBP por su contenedor RIFF/WEBP', () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(tipoRealDeBytes(webp), 'image/webp');
});

test('unos bytes que no son ninguno de los tres formatos -> null', () => {
  // "<html>" -- el caso real que este arreglo cierra: un fichero que dice
  // ser una imagen y no lo es.
  const html = new TextEncoder().encode('<html><script>1</script></html>');
  assert.equal(tipoRealDeBytes(html), null);
});

test('un PNG real no confunde con un WEBP truncado en pocos bytes', () => {
  assert.equal(tipoRealDeBytes(new Uint8Array([0x89, 0x50])), null);
});
