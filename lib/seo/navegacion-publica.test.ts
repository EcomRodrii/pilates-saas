import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_PUBLICO, PIE_PUBLICO } from './navegacion-publica.ts';
import { PAGINAS, paginaDe } from './paginas.ts';

test('todo enlace del menú y del pie públicos apunta a una página del registro', () => {
  const rotos = [...MENU_PUBLICO, ...PIE_PUBLICO.flatMap((c) => c.enlaces)]
    .map((e) => e.href)
    .filter((href) => !paginaDe(href));
  assert.deepEqual(rotos, []);
});

test('ninguna página de dinero queda a más de un clic del pie', () => {
  const enPie = new Set(PIE_PUBLICO.flatMap((c) => c.enlaces.map((e) => e.href)));
  // Las páginas comerciales: precios, soluciones y los hubs. Las 13 comparativas
  // y las 17 funcionalidades cuelgan de su hub, que sí está.
  const dinero = PAGINAS.filter((p) => p.path === '/precios' || p.grupo === 'soluciones' || ['/funcionalidades', '/comparativa', '/recursos'].includes(p.path));
  const fuera = dinero.map((p) => p.path).filter((p) => !enPie.has(p) && p !== '/soluciones');
  assert.deepEqual(fuera, []);
  // /soluciones (el índice) va en el menú, no en el pie.
  assert.ok(MENU_PUBLICO.some((e) => e.href === '/soluciones'));
});

test('el pie no repite enlaces dentro de una misma columna', () => {
  for (const col of PIE_PUBLICO) {
    const hrefs = col.enlaces.map((e) => e.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `columna ${col.titulo}`);
  }
});
