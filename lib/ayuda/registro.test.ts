import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTICULOS, CATEGORIAS, articuloDe } from './registro.ts';

test('todo artículo apunta a una categoría que existe en el registro', () => {
  const slugs = new Set(CATEGORIAS.map((c) => c.slug));
  const huerfanos = ARTICULOS.filter((a) => !slugs.has(a.categoria)).map((a) => `${a.categoria}/${a.slug}`);
  assert.deepEqual(huerfanos, [], `Artículos con categoría inexistente: ${huerfanos.join(', ')}`);
});

test('el slug de cada artículo es único dentro de su categoría', () => {
  const vistos = new Set<string>();
  const repetidos: string[] = [];
  for (const a of ARTICULOS) {
    const clave = `${a.categoria}/${a.slug}`;
    if (vistos.has(clave)) repetidos.push(clave);
    vistos.add(clave);
  }
  assert.deepEqual(repetidos, [], `Slugs duplicados: ${repetidos.join(', ')}`);
});

test('todo "relacionados" apunta a un artículo real del registro (aunque esté en preparación)', () => {
  const rotos: string[] = [];
  for (const a of ARTICULOS) {
    for (const clave of a.relacionados ?? []) {
      const [cat, slug] = clave.split('/');
      if (!articuloDe(cat, slug)) rotos.push(`${a.categoria}/${a.slug} → ${clave}`);
    }
  }
  assert.deepEqual(rotos, [], `Enlaces "relacionados" a artículos que no existen: ${rotos.join(', ')}`);
});
