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
  const resultados = buscarArticulos('login clienta');
  assert.ok(resultados.some((r) => r.articulo.slug === 'acceso-de-una-clienta'));
});

test('buscarArticulos es insensible a mayúsculas y acentos', () => {
  const conAcento = buscarArticulos('cómo entra una clienta');
  const sinAcento = buscarArticulos('como entra una clienta');
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
