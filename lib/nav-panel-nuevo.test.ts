import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULOS, navSections, ESSENTIAL_HREFS } from './nav-config.ts';
import { SECCIONES_PANEL_NUEVO, modulosDelMenu, seccionPanelNuevo, seccionesDelMenu } from './nav-panel-nuevo.ts';
import { puedeVer } from './permisos-reglas.ts';
import { AYUDA_POR_PANTALLA } from './ayuda/pantallas.ts';

// Las secciones que solo existen con el panel nuevo (hoy, Festivos): con el
// interruptor apagado nadie nota nada; encendido, salen en su grupo.

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

test('apagado: el menú es EL MISMO objeto de siempre (ni una entrada de más)', () => {
  assert.equal(seccionesDelMenu(false), navSections);
  assert.deepEqual(modulosDelMenu(false).map((m) => m.href), MODULOS.map((m) => m.href));
});

test('encendido: Festivos sale al final de «Estudio», y nada más cambia', () => {
  const con = seccionesDelMenu(true);
  const estudio = con.find((s) => s.label === 'Estudio')!;
  assert.equal(estudio.items[estudio.items.length - 1].href, '/festivos');
  assert.deepEqual(modulosDelMenu(true).map((m) => m.href), [...MODULOS.map((m) => m.href).slice(0, MODULOS.findIndex((m) => m.href === '/suscripcion') + 1), '/festivos', ...MODULOS.map((m) => m.href).slice(MODULOS.findIndex((m) => m.href === '/suscripcion') + 1)]);
});

test('fuera de MODULOS y de navSections: el asistente, Explorar funciones y las novedades no la conocen', () => {
  for (const s of SECCIONES_PANEL_NUEVO) {
    assert.ok(!MODULOS.some((m) => m.href === s.href), s.href);
    assert.ok(!readFileSync(new URL('./nav-config.ts', import.meta.url), 'utf-8').includes(`href: '${s.href}'`), `${s.href} no va en nav-config`);
  }
});

test('cada una: su grupo existe, su frase, su ficha «?» (sin `valor`: aún no está en el menú de todos) y es esencial', () => {
  const grupos = new Set(navSections.map((s) => s.label));
  for (const s of SECCIONES_PANEL_NUEVO) {
    assert.ok(grupos.has(s.grupo), `${s.href}: el grupo ${s.grupo} no existe`);
    assert.ok(s.frase.length > 20 && s.frase.length <= 140, `${s.href}: frase`);
    const ficha = (AYUDA_POR_PANTALLA as Record<string, { valor?: string }>)[s.href];
    assert.ok(ficha, `${s.href}: sin ficha de ayuda`);
    assert.ok(!('valor' in ficha), `${s.href}: la ficha no lleva valor hasta que esté en el menú de todos`);
    assert.ok(ESSENTIAL_HREFS.includes(s.href), `${s.href}: encenderla en Módulos tiene que enseñarla también en «Esencial»`);
    assert.equal(seccionPanelNuevo(s.href), s);
  }
});

test('sus alias no chocan con los nombres ni los alias del menú', () => {
  const usados = new Set(MODULOS.flatMap((m) => [normalizar(m.label), ...(m.alias ?? []).map(normalizar)]));
  for (const s of SECCIONES_PANEL_NUEVO) {
    for (const a of [s.label, ...(s.alias ?? [])]) {
      assert.equal(a, a.toLowerCase() === a ? normalizar(a) : a, `${a}: alias en minúsculas y sin tildes`);
      assert.ok(!usados.has(normalizar(a)), `${a} ya es de otra sección`);
    }
  }
});

test('Festivos: recepción no entra (decidir es abrir o cerrar); propietaria y gerencia sí; y no se indexa', () => {
  assert.equal(puedeVer('RECEPCION', '/festivos'), false);
  assert.equal(puedeVer('MANAGER', '/festivos'), true);
  assert.equal(puedeVer('PROPIETARIO', '/festivos'), true);
  assert.equal(puedeVer('INSTRUCTOR', '/festivos'), false);
  assert.match(readFileSync(new URL('./seo/no-indexables.ts', import.meta.url), 'utf-8'), /'\/festivos'/);
});
