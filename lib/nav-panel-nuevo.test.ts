import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULOS, navSections, ESSENTIAL_HREFS } from './nav-config.ts';
import { GRUPO_TE_VEN, SECCIONES_MI_WEB_NUEVA, SECCIONES_PANEL_NUEVO, modulosDelMenu, seccionPanelNuevo, seccionesDelMenu } from './nav-panel-nuevo.ts';
import { puedeVer } from './permisos-reglas.ts';
import { AYUDA_POR_PANTALLA } from './ayuda/pantallas.ts';

// Las secciones que solo existen con el panel nuevo: con el interruptor apagado
// nadie nota nada; encendido, salen al final de su grupo. Hoy, Módulos (Festivos
// pasó a todos el 14-oct).

test('apagado: el menú es EL MISMO objeto de siempre (ni una entrada de más)', () => {
  assert.equal(seccionesDelMenu(false), navSections);
  assert.deepEqual(modulosDelMenu(false).map((m) => m.href), MODULOS.map((m) => m.href));
});

test('encendido: cada sección del panel nuevo sale al final de su grupo, y nada más cambia', () => {
  const con = seccionesDelMenu(true);
  for (const s of SECCIONES_PANEL_NUEVO) {
    const grupo = con.find((g) => g.label === s.grupo);
    assert.ok(grupo, `${s.href}: el grupo ${s.grupo} no existe`);
    const propias = SECCIONES_PANEL_NUEVO.filter((x) => x.grupo === s.grupo).map((x) => x.href);
    assert.deepEqual(grupo.items.slice(-propias.length).map((i) => i.href), propias);
  }
  assert.equal(modulosDelMenu(true).length, MODULOS.length + SECCIONES_PANEL_NUEVO.length);
});

test('las del panel nuevo viven fuera de MODULOS y de nav-config (el asistente no las conoce)', () => {
  const nav = readFileSync(new URL('./nav-config.ts', import.meta.url), 'utf-8');
  for (const s of SECCIONES_PANEL_NUEVO) {
    assert.ok(!MODULOS.some((m) => m.href === s.href), s.href);
    assert.ok(!nav.includes(`href: '${s.href}'`), `${s.href} no va en nav-config mientras sea solo del panel nuevo`);
    assert.ok(s.frase.length > 20 && s.frase.length <= 140, `${s.href}: frase`);
  }
});

test('Festivos, para todos: en el menú (Estudio), esencial, con su ficha; recepción fuera y sin indexar', () => {
  const estudio = navSections.find((s) => s.label === 'Estudio')!;
  assert.ok(estudio.items.some((i) => i.href === '/festivos'));
  assert.ok(!SECCIONES_PANEL_NUEVO.some((s) => s.href === '/festivos'), 'no puede estar en los dos sitios');
  assert.ok(ESSENTIAL_HREFS.includes('/festivos'), 'encenderlo en Módulos tiene que enseñarlo también en «Esencial»');
  assert.ok((AYUDA_POR_PANTALLA as Record<string, { valor?: string }>)['/festivos']?.valor);
  assert.equal(puedeVer('RECEPCION', '/festivos'), false);
  assert.equal(puedeVer('MANAGER', '/festivos'), true);
  assert.equal(puedeVer('PROPIETARIO', '/festivos'), true);
  assert.match(readFileSync(new URL('./seo/no-indexables.ts', import.meta.url), 'utf-8'), /'\/festivos'/);
});

test('Módulos: con el panel nuevo, en el menú (Estudio), para quien gestiona; la instructora no tiene panel', () => {
  const estudio = seccionesDelMenu(true).find((s) => s.label === 'Estudio')!;
  const modulos = estudio.items.find((i) => i.href === '/explorar-funciones');
  assert.equal(modulos?.label, 'Módulos');
  assert.ok(!navSections.flatMap((s) => s.items).some((i) => i.href === '/explorar-funciones'), 'sin el panel nuevo no está en el menú');
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) assert.equal(puedeVer(rol, '/explorar-funciones'), true, rol);
  assert.equal(puedeVer('INSTRUCTOR', '/explorar-funciones'), false);
  assert.match(readFileSync(new URL('./seo/no-indexables.ts', import.meta.url), 'utf-8'), /'\/explorar-funciones'/);
});

test('«Tu app» y «Tu web» (MI_WEB_NUEVA): su grupo justo antes de «Estudio», solo con el panel nuevo, y solo para la propietaria', () => {
  // Sin el interruptor, nada cambia; sin el panel nuevo, tampoco (aunque el interruptor esté encendido).
  assert.deepEqual(seccionesDelMenu(true, false), seccionesDelMenu(true));
  assert.equal(seccionesDelMenu(false, true), navSections);
  const con = seccionesDelMenu(true, true);
  const i = con.findIndex((s) => s.label === GRUPO_TE_VEN);
  assert.ok(i > 0, 'el grupo existe');
  assert.equal(con[i + 1]?.label, 'Estudio', 'va justo antes de «Estudio»');
  assert.deepEqual(con[i].items.map((x) => x.href), ['/tu-app', '/tu-web']);
  assert.equal(modulosDelMenu(true, true).length, MODULOS.length + SECCIONES_PANEL_NUEVO.length + SECCIONES_MI_WEB_NUEVA.length);
  for (const s of SECCIONES_MI_WEB_NUEVA) {
    assert.ok(!MODULOS.some((m) => m.href === s.href), `${s.href} fuera de MODULOS`);
    assert.ok(s.frase.length > 20 && s.frase.length <= 140, `${s.href}: frase`);
    assert.ok(ESSENTIAL_HREFS.includes(s.href), `${s.href}: en el menú de serie (es un módulo que se puede ocultar)`);
    assert.equal(seccionPanelNuevo(s.href)?.label, s.label);
    assert.equal(puedeVer('PROPIETARIO', s.href), true, s.href);
    for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const) assert.equal(puedeVer(rol, s.href), false, `${rol} ${s.href}`);
    assert.match(readFileSync(new URL('./seo/no-indexables.ts', import.meta.url), 'utf-8'), new RegExp(`'${s.href}'`));
  }
});
