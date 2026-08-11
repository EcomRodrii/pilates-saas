import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimarProbabilidad, tasaBase, nivelPrediccion, formatearProbabilidad,
  MUESTRA_MINIMA, FUERZA_PRIOR,
} from './prediccion.ts';

const BASE = 'aceptó 8 de sus últimas 10 peticiones';

// ── La mitad del valor: cuándo NO devuelve número ───────────────────────────

test('muestra por debajo del mínimo → null, nunca un porcentaje', () => {
  for (let total = 0; total < MUESTRA_MINIMA; total++) {
    assert.equal(estimarProbabilidad({ exitos: total, total, prior: 0.5, base: BASE }), null);
  }
});

test('4 de 4 no es un 100 % — es muestra insuficiente', () => {
  assert.equal(estimarProbabilidad({ exitos: 4, total: 4, prior: 0.6, base: BASE }), null);
});

test('cifras incoherentes o no numéricas → null', () => {
  assert.equal(estimarProbabilidad({ exitos: 11, total: 10, prior: 0.5, base: BASE }), null);
  assert.equal(estimarProbabilidad({ exitos: -1, total: 10, prior: 0.5, base: BASE }), null);
  assert.equal(estimarProbabilidad({ exitos: 5, total: 10, prior: NaN, base: BASE }), null);
  assert.equal(estimarProbabilidad({ exitos: NaN, total: 10, prior: 0.5, base: BASE }), null);
});

// ── Suavizado hacia el prior ────────────────────────────────────────────────

test('con la muestra justa, el prior todavía pesa: 5 de 5 no llega al 100 %', () => {
  const p = estimarProbabilidad({ exitos: 5, total: 5, prior: 0.5, base: BASE });
  assert.ok(p);
  // (5 + 5·0.5) / (5 + 5) = 0.75
  assert.equal(p.probabilidad, 0.75);
  assert.ok(p.probabilidad < 1);
});

test('cuanta más muestra, menos manda el prior', () => {
  const pocas = estimarProbabilidad({ exitos: 5, total: 5, prior: 0.2, base: BASE })!;
  const muchas = estimarProbabilidad({ exitos: 50, total: 50, prior: 0.2, base: BASE })!;
  assert.ok(muchas.probabilidad > pocas.probabilidad);
  assert.ok(muchas.probabilidad > 0.9);
});

test('sin ningún éxito tampoco se afirma un 0 % rotundo', () => {
  const p = estimarProbabilidad({ exitos: 0, total: 6, prior: 0.5, base: BASE })!;
  // (0 + 5·0.5) / (6 + 5) ≈ 0.227
  assert.ok(p.probabilidad > 0);
  assert.ok(p.probabilidad < 0.33);
});

test('el prior fuera de [0,1] se acota en vez de propagar un número absurdo', () => {
  const alto = estimarProbabilidad({ exitos: 5, total: 10, prior: 4, base: BASE })!;
  const bajo = estimarProbabilidad({ exitos: 5, total: 10, prior: -2, base: BASE })!;
  assert.equal(alto.probabilidad, (5 + FUERZA_PRIOR * 1) / 15);
  assert.equal(bajo.probabilidad, (5 + FUERZA_PRIOR * 0) / 15);
});

test('devuelve la base y la muestra reales junto al número', () => {
  const p = estimarProbabilidad({ exitos: 8, total: 10, prior: 0.6, base: BASE })!;
  assert.equal(p.base, BASE);
  assert.equal(p.nMuestras, 10);
});

// ── tasaBase ────────────────────────────────────────────────────────────────

test('tasaBase: sin observaciones → null (no se inventa un 0.5)', () => {
  assert.equal(tasaBase(0, 0), null);
  assert.equal(tasaBase(3, -1), null);
});

test('tasaBase: proporción simple del grupo', () => {
  assert.equal(tasaBase(3, 12), 0.25);
});

// ── Presentación ────────────────────────────────────────────────────────────

test('nivelPrediccion: cortes de producto', () => {
  assert.equal(nivelPrediccion(0.9), 'ALTA');
  assert.equal(nivelPrediccion(0.5), 'MEDIA');
  assert.equal(nivelPrediccion(0.1), 'BAJA');
  assert.equal(nivelPrediccion(0.67), 'ALTA');
  assert.equal(nivelPrediccion(0.33), 'BAJA');
});

test('formatearProbabilidad: entero con el símbolo, acotado', () => {
  assert.equal(formatearProbabilidad(0.912), '91 %');
  assert.equal(formatearProbabilidad(1.4), '100 %');
  assert.equal(formatearProbabilidad(-0.2), '0 %');
});
