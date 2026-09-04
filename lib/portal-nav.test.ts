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
  const r = resolveNavConfig({ ocultos: ['reservas'], etiquetas: { buscar: 'Explorar' }, iconos: { perfil: 'Star' } });
  assert.deepEqual(r.ocultos, ['reservas']);
  assert.deepEqual(r.etiquetas, { buscar: 'Explorar' });
  assert.deepEqual(r.iconos, { perfil: 'Star' });
});

test('resolveNavConfig: "home" nunca puede quedar oculta, aunque venga en el raw', () => {
  const r = resolveNavConfig({ ocultos: ['home', 'reservas'] });
  assert.deepEqual(r.ocultos, ['reservas']);
});

test('resolveNavConfig: descarta segs desconocidos, iconos fuera del catálogo, y etiquetas vacías', () => {
  const r = resolveNavConfig({
    ocultos: ['no-existe', 'reservas'],
    etiquetas: { reservas: '   ', perfil: 'Mi cuenta' },
    iconos: { reservas: 'IconoInventado', perfil: 'Star' },
  });
  assert.deepEqual(r.ocultos, ['reservas']);
  assert.deepEqual(r.etiquetas, { perfil: 'Mi cuenta' });
  assert.deepEqual(r.iconos, { perfil: 'Star' });
});

test('resolveNavConfig: migra ids retirados (clases/bonos→reservas, videos→eliminado)', () => {
  const r = resolveNavConfig({
    ocultos: ['bonos', 'videos'],
    etiquetas: { clases: 'Mi agenda' },
    iconos: { bonos: 'Ticket' },
  });
  assert.deepEqual(r.ocultos, ['reservas']);
  assert.deepEqual(r.etiquetas, { reservas: 'Mi agenda' });
  assert.deepEqual(r.iconos, { reservas: 'Ticket' });
});

test('resolveNavConfig: al migrar, gana el primer id legacy fusionado en la misma pestaña destino', () => {
  const r = resolveNavConfig({ etiquetas: { clases: 'Agenda', bonos: 'Mis bonos' } });
  assert.deepEqual(r.etiquetas, { reservas: 'Agenda' });
});

test('navItemsVisibles: sin config, devuelve el catálogo por defecto tal cual', () => {
  const r = navItemsVisibles(DEFAULT_NAV_CONFIG);
  assert.deepEqual(r, NAV_DEFAULT);
});

test('navItemsVisibles: filtra ocultas y sustituye etiqueta/icono', () => {
  const config = { ocultos: ['reservas' as const], etiquetas: { buscar: 'Explorar' }, iconos: { perfil: 'Star' as const } };
  const r = navItemsVisibles(config);
  assert.deepEqual(r.map((i) => i.seg), NAV_SEG_IDS.filter((s) => s !== 'reservas'));
  assert.equal(r.find((i) => i.seg === 'buscar')?.label, 'Explorar');
  assert.equal(r.find((i) => i.seg === 'perfil')?.icono, 'Star');
  // Sin override, se queda con lo de siempre.
  assert.equal(r.find((i) => i.seg === 'home')?.label, 'Hoy');
  assert.equal(r.find((i) => i.seg === 'home')?.icono, 'Home');
});

test('navItemsVisibles: respeta `disponibles` (p.ej. tras filtrar por feature-freeze)', () => {
  const soloDos = NAV_DEFAULT.filter((n) => n.seg === 'home' || n.seg === 'reservas');
  const r = navItemsVisibles(DEFAULT_NAV_CONFIG, soloDos);
  assert.deepEqual(r.map((i) => i.seg), ['home', 'reservas']);
});
