import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltaTexto } from './calendario-metricas.ts';

// ── faltaTexto ───────────────────────────────────────────────────────────────

test('faltaTexto: menos de una hora, en minutos', () => {
  assert.equal(faltaTexto(45), 'en 45 min');
});

test('faltaTexto: horas exactas, sin minutos sueltos', () => {
  assert.equal(faltaTexto(120), 'en 2 h');
});

test('faltaTexto: horas y minutos', () => {
  assert.equal(faltaTexto(135), 'en 2 h 15');
});
