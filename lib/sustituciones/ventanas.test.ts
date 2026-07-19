import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVentanas, VENTANA_MIN, VENTANA_MAX } from './ventanas.ts';

const MIN = 60_000;

test('clase ya pasada → no corre', () => {
  const v = calcularVentanas(-5000);
  assert.equal(v.correr, false);
  assert.equal(v.motivo, 'clase_pasada');
});

test('clase justo empezando (0 ms) → no corre', () => {
  assert.equal(calcularVentanas(0).correr, false);
});

test('clase de última hora (5 min) → SÍ corre, comprimido', () => {
  const v = calcularVentanas(5 * MIN); // 1/3 ≈ 1.6 min → suelo 2 min
  assert.equal(v.correr, true);
  assert.equal(v.recordatorioMs, VENTANA_MIN);
  assert.equal(v.avanceMs, VENTANA_MIN);
});

test('clase a 30 min → ventana = 1/3 (10 min)', () => {
  const v = calcularVentanas(30 * MIN);
  assert.equal(v.correr, true);
  assert.equal(v.recordatorioMs, 10 * MIN);
});

test('clase a 9 min → 1/3 = 3 min (por encima del suelo)', () => {
  assert.equal(calcularVentanas(9 * MIN).recordatorioMs, 3 * MIN);
});

test('clase muy lejana → ventana acotada al máximo (45 min)', () => {
  const v = calcularVentanas(10 * 60 * MIN); // 10 h → 1/3 = 200 min
  assert.equal(v.recordatorioMs, VENTANA_MAX);
  assert.equal(v.avanceMs, VENTANA_MAX);
});

test('las dos ventanas + colchón caben antes de la clase (rango realista)', () => {
  for (const min of [3, 5, 8, 12, 20, 45, 90, 180, 600]) {
    const ms = min * MIN;
    const v = calcularVentanas(ms);
    assert.equal(v.correr, true, `debería correr a ${min} min`);
    assert.ok(v.recordatorioMs + v.avanceMs <= ms + VENTANA_MIN, `ventanas exceden en ${min} min`);
  }
});
