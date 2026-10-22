import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gruposConMiWeb, grupoEsLaSeccion, presentarSeccion, seccionVisual } from './mi-web-nueva.ts';
import { GRUPOS_PANEL_NUEVO, SECCIONES, seccionPorId } from './secciones.ts';

test('apagado: las secciones se enseñan como siempre (el mismo objeto)', () => {
  const marca = seccionPorId('marca');
  assert.equal(presentarSeccion(marca, false), marca);
  assert.equal(seccionVisual('web', 'contenido-de-tu-app', false), 'web');
});

test('encendido: «Mi app» y «Mi web», y «Contenido de tu app» vuelve a «Mi app»', () => {
  assert.equal(presentarSeccion(seccionPorId('marca'), true).titulo, 'Mi app');
  assert.equal(presentarSeccion(seccionPorId('web'), true).titulo, 'Mi web');
  // Las demás no cambian, y las direcciones tampoco (el id es el de siempre).
  assert.equal(presentarSeccion(seccionPorId('estudio'), true), seccionPorId('estudio'));
  assert.equal(presentarSeccion(seccionPorId('web'), true).id, 'web');
  assert.equal(seccionVisual('web', 'contenido-de-tu-app', true), 'marca');
  assert.equal(seccionVisual('web', 'widgets', true), 'web');
  assert.equal(seccionVisual('web', null, true), 'web');
});

test('encendido: «Mi app» y «Mi web» son DOS grupos, en el sitio del de antes; apagado, los grupos de siempre', () => {
  assert.deepEqual(gruposConMiWeb(GRUPOS_PANEL_NUEVO, false).map(g => g.id), GRUPOS_PANEL_NUEVO.map(g => g.id));
  const con = gruposConMiWeb(GRUPOS_PANEL_NUEVO, true);
  const antes = GRUPOS_PANEL_NUEVO.findIndex(g => g.id === 'tu-app-y-tu-web');
  assert.deepEqual(con.slice(antes, antes + 2).map(g => [g.id, g.titulo, g.secciones]), [['mi-app', 'Mi app', ['marca']], ['mi-web', 'Mi web', ['web']]]);
  assert.ok(!con.some(g => g.id === 'tu-app-y-tu-web'));
  // Cada sección sigue en un grupo y solo en uno, y en el orden de SECCIONES.
  assert.deepEqual(con.flatMap(g => g.secciones), GRUPOS_PANEL_NUEVO.flatMap(g => g.secciones));
  assert.equal(new Set(con.flatMap(g => g.secciones)).size, SECCIONES.length);
  // No se repite el nombre: el grupo es su sección y se llama igual.
  for (const id of ['mi-app', 'mi-web']) {
    const g = con.find(x => x.id === id)!;
    assert.ok(grupoEsLaSeccion(g, presentarSeccion(seccionPorId(g.secciones[0]), true)), id);
  }
  assert.ok(!grupoEsLaSeccion(con[0], presentarSeccion(seccionPorId(con[0].secciones[0]), true)));
});
