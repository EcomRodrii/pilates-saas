import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PASOS_TOUR } from './tour-pasos.ts';

test('cada paso tiene id, selector y ruta únicos', () => {
  const ids = PASOS_TOUR.map(p => p.id);
  const selectores = PASOS_TOUR.map(p => p.selector);
  const rutas = PASOS_TOUR.map(p => p.ruta);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(selectores).size, selectores.length);
  assert.equal(new Set(rutas).size, rutas.length);
});

test('ningún paso queda vacío de título o descripción', () => {
  for (const p of PASOS_TOUR) {
    assert.ok(p.titulo.length > 0, `paso ${p.id} sin título`);
    assert.ok(p.descripcion.length > 0, `paso ${p.id} sin descripción`);
  }
});

test('todas las rutas empiezan por / (nunca un enlace externo o relativo roto)', () => {
  for (const p of PASOS_TOUR) {
    assert.ok(p.ruta.startsWith('/'), `paso ${p.id} con ruta inválida: ${p.ruta}`);
  }
});
