import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaConTravesia } from './ruta-segura.ts';

// Regresión del zip-slip cross-tenant (auditoría 21-ago). Los tres primeros
// casos son los que se verificaron explotables contra la normalización de
// `new URL()` en lib/r2.ts.
test('rechaza rutas que escapan de su carpeta', () => {
  assert.equal(rutaConTravesia('temas-importados/S/ID/../../OTRO/ID2/index.html'), true);
  assert.equal(rutaConTravesia('../../../backups/OTRO/b.json'), true);
  assert.equal(rutaConTravesia('..'), true);
  assert.equal(rutaConTravesia('/etc/passwd'), true);
  assert.equal(rutaConTravesia('assets\\..\\x.css'), true);
});

// Y NO rompe las rutas legítimas que el importador sí produce — este era el
// motivo de comprobar la ruta y no el pathname de la URL: `URL` percent-codifica
// espacios y acentos, así que comparar pathnames los daría por manipulados.
test('acepta rutas normales, incluidas las de nombres con espacios o acentos', () => {
  assert.equal(rutaConTravesia('index.html'), false);
  assert.equal(rutaConTravesia('assets/logo ñ.png'), false);
  assert.equal(rutaConTravesia('fonts/Inter-Regular.woff2'), false);
  assert.equal(rutaConTravesia('a..b/c.css'), false);
  assert.equal(rutaConTravesia('..oculto/x.css'), false);
});
