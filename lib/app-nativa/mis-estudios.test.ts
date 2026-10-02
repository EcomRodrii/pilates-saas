import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entradaDirecta, estudiosDeLaCuenta, rutaDeEntrada, type FilaEstudioCuenta } from './mis-estudios.ts';

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
