import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { articuloDe, categoriaDe } from './registro.ts';
import { AYUDA_POR_PANTALLA, ayudaDePantalla, urlDeAyuda } from './pantallas.ts';

// Este fichero existe por dos motivos, y ninguno es cosmético:
//
//   1. Un enlace roto en el (i) es peor que no poner el (i). Quien lo pulsa ya
//      está perdido; llevarle a un 404 del centro de ayuda es rematarlo.
//   2. "En cada sección" solo se cumple si algo lo comprueba. El icono se pinta
//      solo (PageHeader lo resuelve por la ruta), así que la única forma de
//      olvidarse es no escribir la ficha — y eso es justo lo que mira el último
//      test.

test('cada ficha apunta a una categoría de ayuda que existe', () => {
  for (const [ruta, ficha] of Object.entries(AYUDA_POR_PANTALLA)) {
    assert.ok(categoriaDe(ficha.destino.categoria), `${ruta}: categoría inexistente «${ficha.destino.categoria}»`);
  }
});

test('cada ficha con artículo apunta a uno publicado', () => {
  for (const [ruta, ficha] of Object.entries(AYUDA_POR_PANTALLA)) {
    const { categoria, slug } = ficha.destino;
    if (!slug) continue;
    const articulo = articuloDe(categoria, slug);
    assert.ok(articulo, `${ruta}: no existe el artículo ${categoria}/${slug}`);
    // Un artículo "próximamente" no tiene contenido: enlazarlo es prometer
    // una guía que no está escrita.
    assert.equal(articulo.estado, 'publicado', `${ruta}: ${categoria}/${slug} no está publicado`);
  }
});

test('las fichas están escritas, no esbozadas', () => {
  for (const [ruta, ficha] of Object.entries(AYUDA_POR_PANTALLA)) {
    assert.ok(ficha.titulo.trim().length > 0, `${ruta}: sin título`);
    assert.ok(ficha.resumen.trim().length >= 60, `${ruta}: el resumen no explica nada`);
    assert.ok(ficha.resumen.length <= 320, `${ruta}: el resumen es demasiado largo para un recuadro`);
    assert.ok(ficha.ahorra.trim().length > 0, `${ruta}: sin la línea de "te quita de encima"`);
    assert.ok(ficha.ahorra.length <= 140, `${ruta}: "te quita de encima" tiene que ser UNA línea`);
  }
});

test('urlDeAyuda distingue artículo de categoría', () => {
  assert.equal(urlDeAyuda({ categoria: 'pagos' }), '/ayuda/pagos');
  assert.equal(urlDeAyuda({ categoria: 'pagos', slug: 'facturas' }), '/ayuda/pagos/facturas');
});

test('la ruta se busca exacta, y la barra final no cuenta', () => {
  assert.ok(ayudaDePantalla('/equipo'));
  assert.ok(ayudaDePantalla('/equipo/'));
  // Una subpantalla de un flujo no hereda la ficha de su sección: se llega a
  // ella desde una pantalla que ya lo explicó.
  assert.equal(ayudaDePantalla('/clientas/importar'), undefined);
  assert.equal(ayudaDePantalla(null), undefined);
});

// Rutas del menú que a propósito NO llevan ficha. Cada una con su motivo: si
// alguna deja de ser cierta, se escribe la ficha, no se amplía la lista.
const SIN_FICHA_A_PROPOSITO: Record<string, string> = {
  // No tiene título de pantalla: abre con el mensaje del día, y el Contrato
  // del Umbral ya explica de qué va la primera vez que entras.
  '/centro-de-control': 'no tiene <h1>; el Contrato del Umbral hace ese papel',
  // Congeladas o escondidas tras un flag: no se ven en el menú, así que no hay
  // "sección" que explicar (lib/frozen-features.ts, MARKETING_MODULE_ENABLED).
  '/chat': 'congelada',
  '/ondemand': 'congelada',
  '/marketing': 'oculta tras MARKETING_MODULE_ENABLED',
};

test('toda sección del menú tiene su ficha', () => {
  const nav = readFileSync(new URL('../nav-config.ts', import.meta.url), 'utf-8');
  const rutas = [...nav.matchAll(/href:\s*'(\/[^']*)'/g)].map((m) => m[1]);
  assert.ok(rutas.length > 10, 'no se han encontrado las rutas del menú: ¿cambió nav-config.ts?');

  const sinFicha = [...new Set(rutas)]
    .filter((r) => !(r in SIN_FICHA_A_PROPOSITO))
    .filter((r) => !AYUDA_POR_PANTALLA[r]);

  assert.deepEqual(
    sinFicha,
    [],
    `Estas pantallas del menú no explican qué son. Escribe su ficha en lib/ayuda/pantallas.ts: ${sinFicha.join(', ')}`
  );
});
