import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asistenciaPorMes, clasesEstaSemana, constancia } from './constancia.ts';

// Jueves 1-oct-2026, mediodía en Madrid: la semana actual empieza el lunes 28-sep.
const AHORA = new Date('2026-10-01T12:00:00+02:00');

test('cuenta por semana de lunes a domingo, en hora de Madrid', () => {
  const c = constancia([
    '2026-09-29T16:00:00Z', // martes de esta semana
    '2026-09-27T21:30:00Z', // domingo 23:30 de Madrid: semana anterior, no esta
    '2026-09-22T16:00:00Z',
    '2026-09-23T16:00:00Z',
  ], AHORA, 4);
  assert.deepEqual(c.semanas, [0, 0, 3, 1]);
  assert.equal(c.semanasSinVenir, 0);
});

test('la media cuenta desde la primera semana en que vino; y cuántas semanas lleva sin venir', () => {
  const c = constancia(['2026-08-04T16:00:00Z', '2026-08-06T16:00:00Z', '2026-08-12T16:00:00Z'], AHORA, 12);
  assert.equal(c.semanas.reduce((a, b) => a + b, 0), 3);
  assert.ok(c.media !== null && c.media > 0 && c.media < 1);
  assert.equal(c.semanasSinVenir, 7);
});

test('sin ninguna clase: sin media; una clase futura no cuenta', () => {
  const c = constancia(['2026-10-05T16:00:00Z'], AHORA, 4);
  assert.deepEqual(c.semanas, [0, 0, 0, 0]);
  assert.equal(c.media, null);
  assert.equal(c.semanasSinVenir, 4);
});

test('esta semana: de lunes a domingo en hora de Madrid, hechas y reservadas', () => {
  // Jueves 1-oct-2026: la semana va del lunes 28-sep al domingo 4-oct.
  const ahora = new Date('2026-10-01T12:00:00+02:00');
  assert.equal(clasesEstaSemana([
    '2026-09-28T09:00:00+02:00', // lunes, hecha
    '2026-10-04T23:30:00+02:00', // domingo por la noche (en UTC ya es lunes 5): cuenta
    '2026-09-27T20:00:00+02:00', // domingo anterior: no
    '2026-10-05T09:00:00+02:00', // lunes siguiente: no
  ], ahora), 2);
});

test('asistencia por mes: los últimos meses, en hora de Madrid, y lo futuro no cuenta', () => {
  const meses = asistenciaPorMes([
    '2026-09-30T22:30:00Z', // 1-oct 00:30 en Madrid: octubre, no septiembre
    '2026-09-15T16:00:00Z',
    '2026-08-03T16:00:00Z',
    '2026-03-02T16:00:00Z', // fuera de los 6 meses
    '2026-10-20T16:00:00Z', // aún no ha pasado
  ], AHORA, 6);
  assert.deepEqual(meses.map(m => m.clave), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(meses.map(m => m.valor), [0, 0, 0, 1, 1, 1]);
});

test('asistencia por mes: cruza de año', () => {
  const meses = asistenciaPorMes(['2025-12-10T16:00:00Z'], new Date('2026-01-15T12:00:00+01:00'), 3);
  assert.deepEqual(meses, [{ clave: '2025-11', valor: 0 }, { clave: '2025-12', valor: 1 }, { clave: '2026-01', valor: 0 }]);
});
