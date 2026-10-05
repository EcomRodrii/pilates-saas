import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conElUltimoPrimero, entradaDirecta, estudiosComoAlumna, estudiosDeLaCuenta, nombreDePila, rutaDeEntrada, type FilaEstudioCuenta,
} from './mis-estudios.ts';

const fila = (id: string, slug: string | null, nombre: string): FilaEstudioCuenta =>
  ({ id, slug, nombre, logo_url: null, color_primario: null });

test('cada estudio dice cómo entra: alumna, instructora o las dos; sin slug no sale', () => {
  const r = estudiosDeLaCuenta(
    [fila('s1', 'zen', 'Zen Pilates'), fila('s2', 'core', 'Core Studio'), fila('s3', 'mix', 'Mixto'), fila('s4', null, 'Sin app')],
    new Set(['s1', 's3']), new Set(['s2', 's3']),
  );
  assert.deepEqual(r.map(e => [e.slug, e.como]), [['core', 'instructora'], ['mix', 'las-dos'], ['zen', 'alumna']]);
});

test('la instructora entra a su parte; la alumna (y quien es las dos), a la app del estudio', () => {
  assert.equal(rutaDeEntrada({ slug: 'core', como: 'instructora' }), '/portal/core/equipo');
  assert.equal(rutaDeEntrada({ slug: 'zen', como: 'alumna' }), '/portal/zen');
  assert.equal(rutaDeEntrada({ slug: 'mix', como: 'las-dos' }), '/portal/mix');
});

test('entra directo al último estudio si sigue siendo suyo, o al único; si no, la lista', () => {
  const lista = estudiosDeLaCuenta([fila('s1', 'zen', 'Zen'), fila('s2', 'core', 'Core')], new Set(['s1', 's2']), new Set());
  assert.equal(entradaDirecta(lista, 'core')?.slug, 'core');
  assert.equal(entradaDirecta(lista, 'ya-no-es-suyo'), null);
  assert.equal(entradaDirecta(lista, null), null);
  assert.equal(entradaDirecta(lista.slice(0, 1), null)?.slug, 'core');
  assert.equal(entradaDirecta([], 'zen'), null);
});

test('es alumna donde su ficha ya es suya Y donde una ficha con su email aún no lo es', () => {
  const alumna = estudiosComoAlumna([{ studio_id: 's1' }], [{ studio_id: 's2' }, { studio_id: 's1' }]);
  assert.deepEqual([...alumna].sort(), ['s1', 's2']);
});

test('la ciudad del estudio llega a la lista; vacía, null', () => {
  const [a, b] = estudiosDeLaCuenta(
    [{ id: 's1', slug: 'a', nombre: 'A', ciudad: '  ', logo_url: null, color_primario: null },
      { id: 's2', slug: 'b', nombre: 'B', ciudad: 'Valencia', logo_url: null, color_primario: null }],
    new Set(['s1', 's2']), new Set(),
  );
  assert.equal(a.ciudad, null);
  assert.equal(b.ciudad, 'Valencia');
});

test('saluda por el nombre de pila de la primera ficha que lo tenga', () => {
  assert.equal(nombreDePila([null, '  ', 'Lucía  Pérez']), 'Lucía');
  assert.equal(nombreDePila([]), null);
});

test('el último que abrió va el primero; el orden del resto no cambia', () => {
  const l = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
  assert.deepEqual(conElUltimoPrimero(l, 'c').map((e) => e.slug), ['c', 'a', 'b']);
  assert.deepEqual(conElUltimoPrimero(l, 'x').map((e) => e.slug), ['a', 'b', 'c']);
  assert.deepEqual(conElUltimoPrimero(l, null).map((e) => e.slug), ['a', 'b', 'c']);
});
