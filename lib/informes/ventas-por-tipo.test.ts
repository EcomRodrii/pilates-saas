import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVariacionPct, combinarConVariacion, ORDEN_TIPOS, ETIQUETAS_TIPO } from './ventas-por-tipo.ts';

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

test('combinarConVariacion: incluye las 4 categorías en orden fijo aunque falten en la RPC', () => {
  const actual = [{ tipo: 'MENSUAL', nVentas: 3, total: 300 }];
  const anterior: typeof actual = [];
  const result = combinarConVariacion(actual, anterior);
  assert.deepEqual(result.map((r) => r.tipo), ORDEN_TIPOS);
  const mensual = result.find((r) => r.tipo === 'MENSUAL')!;
  assert.equal(mensual.total, 300);
  assert.equal(mensual.nVentas, 3);
  assert.equal(mensual.variacionPct, null); // sin período anterior
  const bono = result.find((r) => r.tipo === 'BONO')!;
  assert.equal(bono.total, 0);
  assert.equal(bono.nVentas, 0);
  assert.equal(bono.variacionPct, null);
});

test('combinarConVariacion: calcula variación cuando hay datos en ambos períodos', () => {
  const actual = [{ tipo: 'BONO', nVentas: 10, total: 500 }];
  const anterior = [{ tipo: 'BONO', nVentas: 8, total: 400 }];
  const result = combinarConVariacion(actual, anterior);
  const bono = result.find((r) => r.tipo === 'BONO')!;
  assert.equal(bono.variacionPct, 25);
});

test('combinarConVariacion: OTROS agrupa recibos sin plan (histórico/POS)', () => {
  const actual = [{ tipo: 'OTROS', nVentas: 13, total: 2892.05 }];
  const result = combinarConVariacion(actual, []);
  const otros = result.find((r) => r.tipo === 'OTROS')!;
  assert.equal(otros.etiqueta, ETIQUETAS_TIPO.OTROS);
  assert.equal(otros.total, 2892.05);
});
