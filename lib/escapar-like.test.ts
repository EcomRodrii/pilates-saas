import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escaparLike } from './escapar-like.ts';
import { ciudadDesdeParam } from './network/ciudad-param.ts';

test('escaparLike neutraliza los comodines de ILIKE', () => {
  // El caso real: /network/instructoras/ciudad/%25 llegaba como '%' y producía
  // ilike('ciudad', '%%%'), que casa con TODAS las ciudades.
  assert.equal(escaparLike('%'), '\\%');
  assert.equal(escaparLike('_'), '\\_');
  assert.equal(escaparLike('50%_off'), '50\\%\\_off');
  // La barra primero, o se re-escaparían las que añadimos después.
  assert.equal(escaparLike('a\\b'), 'a\\\\b');
  // `*` lo traduce PostgREST a `%` por su cuenta: se quita, no se escapa.
  assert.equal(escaparLike('Mad*rid'), 'Madrid');
});

test('escaparLike no toca una ciudad normal (control positivo)', () => {
  assert.equal(escaparLike('Madrid'), 'Madrid');
  assert.equal(escaparLike("L'Hospitalet de Llobregat"), "L'Hospitalet de Llobregat");
  assert.equal(escaparLike('A Coruña'), 'A Coruña');
});

test('ciudadDesdeParam acepta topónimos reales', () => {
  assert.equal(ciudadDesdeParam('madrid'), 'Madrid');
  assert.equal(ciudadDesdeParam('san-sebastian'), 'San Sebastian');
  assert.equal(ciudadDesdeParam('a-coru%C3%B1a'), 'A Coruña');
});

test('ciudadDesdeParam NO 404ea las URLs que genera el propio sitemap', () => {
  // `slugCiudadUrl` solo cambia espacios por guiones, así que la puntuación de
  // los topónimos llega entera a la URL. Una versión anterior de la validación
  // (`[\p{L}\p{N} -]`) devolvía 404 en todos estos, que son páginas vivas
  // enlazadas desde app/sitemap.ts. Estos son el motivo de que la clase de
  // caracteres sea la que es: si alguien la recorta, esto se pone rojo.
  for (const slug of [
    "l'hospitalet-de-llobregat",
    "sant-joan-d'alacant",
    'nucia,-la',
    'donostia/san-sebastián',
    'vitoria-gasteiz',
    'sant-cugat-del-vallès',
    'o-barco-de-valdeorras',
  ]) {
    assert.notEqual(ciudadDesdeParam(slug), null, `${slug} es un topónimo real y no puede dar 404`);
  }
});

test('ciudadDesdeParam devuelve null (→404) ante una URL fabricada', () => {
  assert.equal(ciudadDesdeParam('%25'), null, 'comodín de ILIKE');
  assert.equal(ciudadDesdeParam('_'), null, 'comodín de un carácter');
  assert.equal(ciudadDesdeParam('%ZZ'), null, 'percent-encoding mal formado: no debe lanzar');
  assert.equal(ciudadDesdeParam('x'.repeat(61)), null, 'longitud desmedida');
  assert.equal(ciudadDesdeParam('madrid-es-una-<estafa>'), null, 'texto arbitrario para el <title>/<h1>');
});
