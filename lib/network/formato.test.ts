import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoAnios } from './formato.ts';

test('sin fecha de fin: "Actualidad"', () => {
  assert.equal(rangoAnios('2023-03-01', null), '2023 — Actualidad');
});

test('con fecha de fin en otro año: rango', () => {
  assert.equal(rangoAnios('2023-03-01', '2025-06-01'), '2023 — 2025');
});

test('mismo año de inicio y fin: un solo año', () => {
  assert.equal(rangoAnios('2024-01-01', '2024-11-01'), '2024');
});
