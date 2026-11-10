import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeAjustarAforoASalaCapacidad, motivoAforoBloqueado } from './calendario-acciones.ts';

// ── puedeAjustarAforoASalaCapacidad ─────────────────────────────────────────

test('permite ajustar si las confirmadas caben en la capacidad de la sala', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(6, 8), true);
});

test('permite ajustar en el límite exacto (confirmadas === capacidad)', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(8, 8), true);
});

test('bloquea si dejaría a alguna alumna confirmada sin plaza', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(10, 8), false);
});

// ── motivoAforoBloqueado ─────────────────────────────────────────────────────

test('motivoAforoBloqueado singular con 1 alumna de más', () => {
  assert.match(motivoAforoBloqueado(9, 8), /1 alumna confirmada de más/);
});

test('motivoAforoBloqueado plural con varias alumnas de más', () => {
  assert.match(motivoAforoBloqueado(11, 8), /3 alumnas confirmadas de más/);
});
