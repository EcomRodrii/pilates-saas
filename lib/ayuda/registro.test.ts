import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ⚠️ Un artículo `publicado` sin componente de contenido es un 404: la página
// (`app/ayuda/[categoria]/[articulo]`) llama a `contenidoDe` y hace `notFound()`
// si no encuentra nada. Sale enlazado desde su categoría, desde el buscador y
// desde el (i) de la pantalla que lo apunta, y no falla en ningún sitio hasta
// que alguien lo pulsa. Se lee el fichero como texto porque es un `.tsx` con
// `import()` perezosos: cargarlo aquí arrastraría media app.
test('todo artículo publicado tiene su componente de contenido', () => {
  // ⚠️ Línea a línea y saltando las comentadas. Con un `matchAll` sobre el
  // fichero entero, una entrada comentada seguía contando como presente: la
  // primera versión de este test pasaba tan tranquila con el artículo fuera
  // del mapa, que es exactamente el fallo que viene a cazar.
  const fuente = readFileSync(new URL('./contenido.tsx', import.meta.url), 'utf-8');
  const conContenido = new Set(
    fuente
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('//'))
      .flatMap((linea) => [...linea.matchAll(/'([a-z0-9-]+\/[a-z0-9-]+)':\s*\(\)\s*=>/g)].map((m) => m[1]))
  );
  assert.ok(conContenido.size > 20, 'no se han leído las claves de contenido.tsx: ¿cambió el formato?');

  const huerfanos = ARTICULOS
    .filter((a) => a.estado === 'publicado')
    .map((a) => `${a.categoria}/${a.slug}`)
    .filter((clave) => !conContenido.has(clave));

  assert.deepEqual(huerfanos, [], `Publicados sin contenido (dan 404 al abrirlos): ${huerfanos.join(', ')}`);
});
