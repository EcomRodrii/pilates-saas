import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiActivaSegunFila, idsConApiActiva } from './acceso.ts';

test('sin fila, la API está activa: el estudio nuevo no necesita que nadie la active', () => {
  assert.equal(apiActivaSegunFila(null), true);
  assert.equal(apiActivaSegunFila(undefined), true);
});

test('una fila de las antiguas (activada a mano) sigue activa', () => {
  assert.equal(apiActivaSegunFila({ desactivada_en: null }), true);
});

test('solo la desactivación explícita la corta', () => {
  assert.equal(apiActivaSegunFila({ desactivada_en: '2026-10-16T10:00:00Z' }), false);
});

test('en una cadena, una sede nueva entra activa y solo cae la desactivada', () => {
  const activas = idsConApiActiva(['a', 'b', 'nueva'], new Set(['b']));
  assert.deepEqual([...activas].sort(), ['a', 'nueva']);
});
