import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, aplicarLayout, DEFAULT_LAYOUT, type OrdenVisibilidad } from './layout-schema.ts';

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
  assert.deepEqual(r, { orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior', home: { orden: [], ocultos: [] } });
});

test('resolveLayout: resuelve la config de la home', () => {
  const r = resolveLayout({ home: { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] } });
  assert.deepEqual(r.home, { orden: ['ingresos', 'kpis'], ocultos: ['graficos'] });
  assert.deepEqual(resolveLayout({ home: 'basura' }).home, { orden: [], ocultos: [] });
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
