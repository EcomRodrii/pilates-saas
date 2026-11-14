import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarArticulos, categoriasSugeridas } from './busqueda.ts';

test('buscarArticulos con query vacía devuelve todos los artículos publicados', () => {
  const resultados = buscarArticulos('');
  assert.ok(resultados.length > 0);
  assert.ok(resultados.every((r) => r.articulo.estado === 'publicado'));
});

test('buscarArticulos encuentra por un término de sinónimo, no solo por el título', () => {
  // "acceso-de-una-clienta" no lleva "login" en el título, pero sí en `terminos`.
  const resultados = buscarArticulos('login cliente');
  assert.ok(resultados.some((r) => r.articulo.slug === 'acceso-de-una-clienta'));
});

test('buscarArticulos es insensible a mayúsculas y acentos', () => {
  const conAcento = buscarArticulos('cómo entra un cliente');
  const sinAcento = buscarArticulos('como entra un cliente');
  assert.deepEqual(conAcento.map((r) => r.href), sinAcento.map((r) => r.href));
});

test('buscarArticulos con una consulta sin coincidencias devuelve vacío', () => {
  assert.deepEqual(buscarArticulos('xyzxyzxyz-no-existe'), []);
});

test('categoriasSugeridas nunca sugiere para una query vacía', () => {
  assert.deepEqual(categoriasSugeridas(''), []);
});

test('categoriasSugeridas devuelve como mucho `max` categorías', () => {
  assert.ok(categoriasSugeridas('reservas', 2).length <= 2);
});

test('buscarArticulos: las palabras pueden ir en cualquier orden y no hace falta que vayan seguidas', () => {
  const r = buscarArticulos('bono caducidad');
  assert.ok(r.some((x) => x.articulo.slug === 'caducidad-de-un-bono'), 'debería encontrar «Caducidad y pausa de un bono»');
  assert.deepEqual(buscarArticulos('caducidad bono').map((x) => x.href), r.map((x) => x.href));
});

test('buscarArticulos: todas las palabras tienen que estar; una que no existe lo vacía', () => {
  assert.ok(buscarArticulos('bono xyzxyz').length === 0);
});

test('buscarArticulos: lo que coincide en el título va antes que lo que coincide solo en la descripción', () => {
  const r = buscarArticulos('stripe');
  assert.ok(r.length > 1);
  assert.match(r[0].articulo.titulo.toLowerCase(), /stripe/);
});
