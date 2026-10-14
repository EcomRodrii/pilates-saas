import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULOS, navSections, ESSENTIAL_HREFS } from './nav-config.ts';
import { SECCIONES_PANEL_NUEVO, modulosDelMenu, seccionesDelMenu } from './nav-panel-nuevo.ts';
import { puedeVer } from './permisos-reglas.ts';
import { AYUDA_POR_PANTALLA } from './ayuda/pantallas.ts';

// Las secciones que solo existen con el panel nuevo: con el interruptor apagado
// nadie nota nada; encendido, salen al final de su grupo. Hoy no hay ninguna
// (Festivos pasó a todos el 14-oct): estas guardias quedan para la próxima.

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
