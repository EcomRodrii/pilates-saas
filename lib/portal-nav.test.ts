import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_DEFAULT, resolveNavConfig, navItemsVisibles, NAV_SEG_IDS, DEFAULT_NAV_CONFIG,
} from './portal-nav.ts';

test('DEFAULT_NAV_CONFIG: nada oculto, nada renombrado', () => {
  assert.deepEqual(DEFAULT_NAV_CONFIG, { ocultos: [], etiquetas: {}, iconos: {} });
});

test('resolveNavConfig: null/garbage → default, nunca lanza', () => {
  assert.deepEqual(resolveNavConfig(null), DEFAULT_NAV_CONFIG);
  assert.deepEqual(resolveNavConfig('basura'), DEFAULT_NAV_CONFIG);
  assert.deepEqual(resolveNavConfig(42), DEFAULT_NAV_CONFIG);
});

test('resolveNavConfig: respeta ocultos/etiquetas/iconos válidos', () => {
  const r = resolveNavConfig({ ocultos: ['videos'], etiquetas: { clases: 'Agenda' }, iconos: { perfil: 'Star' } });
  assert.deepEqual(r.ocultos, ['videos']);
  assert.deepEqual(r.etiquetas, { clases: 'Agenda' });
  assert.deepEqual(r.iconos, { perfil: 'Star' });
});

test('resolveNavConfig: "home" nunca puede quedar oculta, aunque venga en el raw', () => {
  const r = resolveNavConfig({ ocultos: ['home', 'videos'] });
  assert.deepEqual(r.ocultos, ['videos']);
});

test('resolveNavConfig: descarta segs desconocidos, iconos fuera del catálogo, y etiquetas vacías', () => {
  const r = resolveNavConfig({
    ocultos: ['no-existe', 'clases'],
    etiquetas: { clases: '   ', bonos: 'Mis bonos' },
    iconos: { clases: 'IconoInventado', bonos: 'Star' },
  });
  assert.deepEqual(r.ocultos, ['clases']);
  assert.deepEqual(r.etiquetas, { bonos: 'Mis bonos' });
  assert.deepEqual(r.iconos, { bonos: 'Star' });
});

test('navItemsVisibles: sin config, devuelve el catálogo por defecto tal cual', () => {
  const r = navItemsVisibles(DEFAULT_NAV_CONFIG);
  assert.deepEqual(r, NAV_DEFAULT);
});

test('navItemsVisibles: filtra ocultas y sustituye etiqueta/icono', () => {
  const config = { ocultos: ['videos' as const], etiquetas: { clases: 'Agenda' }, iconos: { bonos: 'Star' as const } };
  const r = navItemsVisibles(config);
  assert.deepEqual(r.map((i) => i.seg), NAV_SEG_IDS.filter((s) => s !== 'videos'));
  assert.equal(r.find((i) => i.seg === 'clases')?.label, 'Agenda');
  assert.equal(r.find((i) => i.seg === 'bonos')?.icono, 'Star');
  // Sin override, se queda con lo de siempre.
  assert.equal(r.find((i) => i.seg === 'home')?.label, 'Inicio');
  assert.equal(r.find((i) => i.seg === 'home')?.icono, 'Home');
});

test('navItemsVisibles: respeta `disponibles` (p.ej. tras filtrar por feature-freeze)', () => {
  const soloDos = NAV_DEFAULT.filter((n) => n.seg === 'home' || n.seg === 'clases');
  const r = navItemsVisibles(DEFAULT_NAV_CONFIG, soloDos);
  assert.deepEqual(r.map((i) => i.seg), ['home', 'clases']);
});
