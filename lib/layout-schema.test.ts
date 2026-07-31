import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, aplicarLayout, DEFAULT_LAYOUT, layoutConfigSchema, type OrdenVisibilidad } from './layout-schema.ts';
import { DEFAULT_HOME_BLOQUES_SHAPE } from './portal-home-bloques.ts';

test('resolveLayout: null/garbage → default', () => {
  assert.deepEqual(resolveLayout(null), DEFAULT_LAYOUT);
  assert.deepEqual(resolveLayout('x'), DEFAULT_LAYOUT);
  assert.deepEqual(resolveLayout(7), DEFAULT_LAYOUT);
});

test('resolveLayout: filtra tipos inválidos por campo', () => {
  const r = resolveLayout({ orden: ['/a', 3, '/b'], ocultos: 'no', menuPosition: 'raro' });
  assert.deepEqual(r.orden, ['/a', '/b']);
  assert.deepEqual(r.ocultos, []);
  assert.equal(r.menuPosition, 'lateral');
});

test('resolveLayout: config válida se respeta', () => {
  const r = resolveLayout({ orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior' });
  assert.deepEqual(r, {
    orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior',
    home: { orden: [], ocultos: [] },
    portalHome: { orden: [], ocultos: [] },
    homeBloques: DEFAULT_HOME_BLOQUES_SHAPE,
  });
});

test('resolveLayout: resuelve homeBloques (Fase 3) — ver portal-home-bloques.test.ts para el detalle de resolveHomeBloques', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveLayout({ homeBloques: guardado });
  assert.deepEqual(r.homeBloques.publicado, guardado.publicado);
});

test('resolveLayout: resuelve la config de la home', () => {
  const r = resolveLayout({ home: { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] } });
  assert.deepEqual(r.home, { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] });
  assert.deepEqual(resolveLayout({ home: 'basura' }).home, { orden: [], ocultos: [] });
});

test('resolveLayout: resuelve la config de portalHome (Inicio del portal cliente)', () => {
  const r = resolveLayout({ portalHome: { orden: ['estaSemana', 'invitarAmiga'], ocultos: ['accesosRapidos'] } });
  assert.deepEqual(r.portalHome, { orden: ['estaSemana', 'invitarAmiga'], ocultos: ['accesosRapidos'] });
  assert.deepEqual(resolveLayout({ portalHome: 'basura' }).portalHome, { orden: [], ocultos: [] });
});

const TODOS = ['/dashboard', '/calendario', '/socios', '/pagos', '/pos'];

test('aplicarLayout: default no cambia el orden', () => {
  assert.deepEqual(aplicarLayout(TODOS, DEFAULT_LAYOUT), TODOS);
});

test('aplicarLayout: oculta módulos', () => {
  const cfg: OrdenVisibilidad = { orden: [], ocultos: ['/pos', '/pagos'] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/dashboard', '/calendario', '/socios']);
});

test('aplicarLayout: reordena y añade el resto en orden natural', () => {
  const cfg: OrdenVisibilidad = { orden: ['/socios', '/dashboard'], ocultos: [] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/socios', '/dashboard', '/calendario', '/pagos', '/pos']);
});

test('aplicarLayout: ignora hrefs de orden que ya no existen', () => {
  const cfg: OrdenVisibilidad = { orden: ['/borrado', '/pos'], ocultos: [] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/dashboard', '/calendario', '/socios', '/pagos']);
});

test('aplicarLayout: reordenar + ocultar a la vez', () => {
  const cfg: OrdenVisibilidad = { orden: ['/pos', '/socios'], ocultos: ['/dashboard'] };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/socios', '/calendario', '/pagos']);
});

test('layoutConfigSchema: homeBloques ausente → default (config guardada antes de esta fase)', () => {
  const sinBloques = { ...DEFAULT_LAYOUT };
  const objSinBloques = sinBloques as Record<string, unknown>;
  delete objSinBloques.homeBloques;
  const r = layoutConfigSchema.safeParse(objSinBloques);
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.homeBloques, DEFAULT_HOME_BLOQUES_SHAPE);
});

test('layoutConfigSchema: acepta un bloque de cada tipo del catálogo', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    homeBloques: {
      draft: [
        { id: 'a', kind: 'banner', config: { imagenUrl: 'https://x.com/i.png', titulo: 'T', texto: 'x', href: '/reservar' } },
        { id: 'b', kind: 'texto', config: { titulo: 'T', texto: 'x' } },
        { id: 'c', kind: 'cta', config: { titulo: 'T', textoBoton: 'Ir', href: '/reservar' } },
        { id: 'd', kind: 'faq', config: { titulo: 'T', preguntas: [{ pregunta: '¿?', respuesta: '.' }] } },
      ],
      publicado: [],
    },
  });
  assert.equal(r.success, true);
});

test('layoutConfigSchema: rechaza un bloque de kind desconocido', () => {
  const r = layoutConfigSchema.safeParse({
    ...DEFAULT_LAYOUT,
    homeBloques: { draft: [{ id: 'a', kind: 'carrusel', config: {} }], publicado: [] },
  });
  assert.equal(r.success, false);
});
