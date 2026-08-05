import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PASOS_TOUR, resolverPasoGuardado } from './tour-pasos.ts';

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

// Regresión real (bloqueó CI en #679): Number(null) da 0, no NaN. Sin
// distinguir "la clave no existe" de "vale 0", cualquier página sin la
// clave todavía en localStorage arrancaba el tour solo, con su overlay
// bloqueando clics en toda la app.
test('sin la clave en localStorage (null), el tour NO se activa solo', () => {
  assert.equal(resolverPasoGuardado(null), -1);
});

test('con un valor guardado válido, retoma en ese paso', () => {
  assert.equal(resolverPasoGuardado('0'), 0);
  assert.equal(resolverPasoGuardado('3'), 3);
});

test('con un valor fuera de rango o corrupto, no se activa', () => {
  assert.equal(resolverPasoGuardado('-1'), -1);
  assert.equal(resolverPasoGuardado(String(PASOS_TOUR.length)), -1);
  assert.equal(resolverPasoGuardado('no-es-un-numero'), -1);
  assert.equal(resolverPasoGuardado(''), -1);
});
