import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeAjustarAforoASalaCapacidad, motivoAforoBloqueado, preguntaAvisoCobertura } from './calendario-acciones.ts';

// ── puedeAjustarAforoASalaCapacidad ─────────────────────────────────────────

test('permite ajustar si las confirmadas caben en la capacidad de la sala', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(6, 8), true);
});

test('permite ajustar en el límite exacto (confirmadas === capacidad)', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(8, 8), true);
});

test('bloquea si dejaría a alguna clienta confirmada sin plaza', () => {
  assert.equal(puedeAjustarAforoASalaCapacidad(10, 8), false);
});

// ── motivoAforoBloqueado ─────────────────────────────────────────────────────

test('motivoAforoBloqueado singular con 1 clienta de más', () => {
  assert.match(motivoAforoBloqueado(9, 8), /1 clienta confirmada de más/);
});

test('motivoAforoBloqueado plural con varias clientas de más', () => {
  assert.match(motivoAforoBloqueado(11, 8), /3 clientas confirmadas de más/);
});

// ── preguntaAvisoCobertura ───────────────────────────────────────────────────

test('preguntaAvisoCobertura: 0 clientas, pregunta en genérico', () => {
  assert.equal(preguntaAvisoCobertura(0), '¿Avisamos de que la clase sigue en pie?');
});

test('preguntaAvisoCobertura: 1 clienta, singular', () => {
  assert.match(preguntaAvisoCobertura(1), /la clienta apuntada/);
});

test('preguntaAvisoCobertura: varias clientas, plural con número', () => {
  assert.match(preguntaAvisoCobertura(5), /las 5 clientas apuntadas/);
});
