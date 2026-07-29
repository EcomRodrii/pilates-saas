import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenAvisos, selloTemporal } from './avisos-portal.ts';

test('sin nada nuevo no se inventa una cifra', () => {
  assert.equal(resumenAvisos(0), 'Nada nuevo.');
  assert.equal(resumenAvisos(-1), 'Nada nuevo.');
});

test('uno va en singular', () => {
  assert.equal(resumenAvisos(1), 'Una cosa nueva.');
});

test('hasta nueve el número va en letra, y es principio de frase', () => {
  assert.equal(resumenAvisos(2), 'Dos cosas nuevas.');
  assert.equal(resumenAvisos(9), 'Nueve cosas nuevas.');
});

test('a partir de diez va en cifra', () => {
  assert.equal(resumenAvisos(10), '10 cosas nuevas.');
  assert.equal(resumenAvisos(23), '23 cosas nuevas.');
});

// ── Sello temporal ───────────────────────────────────────────────────────────

const ahora = new Date(2026, 6, 29, 18, 30); // 29 de julio de 2026, 18:30 local

test('lo de hace un rato no dice "hace 0 h"', () => {
  assert.equal(selloTemporal(new Date(2026, 6, 29, 18, 10).toISOString(), ahora), 'ahora mismo');
});

test('lo de hoy cuenta horas', () => {
  assert.equal(selloTemporal(new Date(2026, 6, 29, 16, 30).toISOString(), ahora), 'hace 2 h');
});

test('el corte es por día natural, no por 24 horas', () => {
  // Tres horas antes, pero al otro lado de la medianoche: es de ayer.
  const medianoche = new Date(2026, 6, 29, 1, 0);
  assert.equal(selloTemporal(new Date(2026, 6, 28, 22, 0).toISOString(), medianoche), 'ayer');
});

test('ayer se dice ayer', () => {
  assert.equal(selloTemporal(new Date(2026, 6, 28, 9, 0).toISOString(), ahora), 'ayer');
});

test('más atrás se dice la fecha', () => {
  assert.equal(selloTemporal(new Date(2026, 6, 27, 9, 0).toISOString(), ahora), '27 de julio');
  assert.equal(selloTemporal(new Date(2026, 6, 24, 9, 0).toISOString(), ahora), '24 de julio');
});

test('otro año lleva el año', () => {
  assert.equal(selloTemporal(new Date(2025, 11, 3, 9, 0).toISOString(), ahora), '3 de diciembre de 2025');
});

test('el primer día del mes no se va al mes anterior', () => {
  // Con `toISOString()` en un huso al este de UTC, el 1 de agosto a las 00:30
  // local es el 31 de julio en UTC. Aquí se lee en local, así que no pasa.
  const primeroDeAgosto = new Date(2026, 7, 1, 0, 30);
  assert.equal(selloTemporal(primeroDeAgosto.toISOString(), primeroDeAgosto), 'ahora mismo');
  assert.equal(selloTemporal(primeroDeAgosto.toISOString(), new Date(2026, 7, 3, 12, 0)), '1 de agosto');
});

test('una fecha ilegible no rompe la lista', () => {
  assert.equal(selloTemporal('no es una fecha', ahora), '');
});
