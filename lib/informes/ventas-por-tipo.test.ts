import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVariacionPct } from './ventas-por-tipo.ts';

test('calcularVariacionPct: sube un 20%', () => {
  assert.equal(calcularVariacionPct(120, 100), 20);
});

test('calcularVariacionPct: baja un 50%', () => {
  assert.equal(calcularVariacionPct(50, 100), -50);
});

test('calcularVariacionPct: sin período anterior devuelve null, no Infinity', () => {
  assert.equal(calcularVariacionPct(100, 0), null);
  assert.equal(calcularVariacionPct(0, 0), null);
});
