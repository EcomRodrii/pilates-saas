import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, aplicarLayout, DEFAULT_LAYOUT, type LayoutConfig } from './layout-schema.ts';

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
  assert.deepEqual(r, { orden: ['/x'], ocultos: ['/y'], menuPosition: 'superior' });
});

const TODOS = ['/dashboard', '/calendario', '/socios', '/pagos', '/pos'];

test('aplicarLayout: default no cambia el orden', () => {
  assert.deepEqual(aplicarLayout(TODOS, DEFAULT_LAYOUT), TODOS);
});

test('aplicarLayout: oculta módulos', () => {
  const cfg: LayoutConfig = { orden: [], ocultos: ['/pos', '/pagos'], menuPosition: 'lateral' };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/dashboard', '/calendario', '/socios']);
});

test('aplicarLayout: reordena y añade el resto en orden natural', () => {
  const cfg: LayoutConfig = { orden: ['/socios', '/dashboard'], ocultos: [], menuPosition: 'lateral' };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/socios', '/dashboard', '/calendario', '/pagos', '/pos']);
});

test('aplicarLayout: ignora hrefs de orden que ya no existen', () => {
  const cfg: LayoutConfig = { orden: ['/borrado', '/pos'], ocultos: [], menuPosition: 'lateral' };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/dashboard', '/calendario', '/socios', '/pagos']);
});

test('aplicarLayout: reordenar + ocultar a la vez', () => {
  const cfg: LayoutConfig = { orden: ['/pos', '/socios'], ocultos: ['/dashboard'], menuPosition: 'lateral' };
  assert.deepEqual(aplicarLayout(TODOS, cfg), ['/pos', '/socios', '/calendario', '/pagos']);
});
