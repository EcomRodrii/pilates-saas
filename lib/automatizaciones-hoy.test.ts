import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrosDeHoy, saludoDelEstudio } from './automatizaciones-hoy.ts';

// El «hoy» del resumen de /automatizaciones es el día de Madrid, no el UTC.

const log = (id: string, ejecutadoEn: string) => ({ id, ejecutadoEn });

test('a las 01:30 de Madrid (23:30 UTC del día antes), «hoy» es el día nuevo', () => {
  const ahora = new Date('2026-10-04T23:30:00.000Z'); // 5-oct 01:30 Madrid
  const logs = [
    log('ayer-tarde', '2026-10-04T18:00:00.000Z'),     // 4-oct 20:00 Madrid
    log('hoy-madrugada', '2026-10-04T22:15:00.000Z'),  // 5-oct 00:15 Madrid
  ];
  assert.deepEqual(registrosDeHoy(logs, ahora).map(l => l.id), ['hoy-madrugada']);
});

test('en invierno, la medianoche de Madrid es las 23:00 UTC', () => {
  const ahora = new Date('2026-01-15T10:00:00.000Z');
  const logs = [
    log('ayer', '2026-01-14T22:59:00.000Z'),
    log('hoy', '2026-01-14T23:00:00.000Z'),
    log('hoy-tarde', '2026-01-15T22:30:00.000Z'),
    log('mañana', '2026-01-15T23:05:00.000Z'),
  ];
  assert.deepEqual(registrosDeHoy(logs, ahora).map(l => l.id), ['hoy', 'hoy-tarde']);
});

test('los días de cambio de hora', () => {
  // 29-mar: el día de Madrid va de las 23:00 UTC del 28 a las 22:00 UTC del 29.
  const primavera = new Date('2026-03-29T12:00:00.000Z');
  assert.deepEqual(registrosDeHoy([
    log('a', '2026-03-28T22:59:00.000Z'), log('b', '2026-03-28T23:00:00.000Z'),
    log('c', '2026-03-29T21:59:00.000Z'), log('d', '2026-03-29T22:00:00.000Z'),
  ], primavera).map(l => l.id), ['b', 'c']);
  // 25-oct: de las 22:00 UTC del 24 a las 23:00 UTC del 25.
  const otono = new Date('2026-10-25T12:00:00.000Z');
  assert.deepEqual(registrosDeHoy([
    log('a', '2026-10-24T21:59:00.000Z'), log('b', '2026-10-24T22:00:00.000Z'),
    log('c', '2026-10-25T22:59:00.000Z'), log('d', '2026-10-25T23:00:00.000Z'),
  ], otono).map(l => l.id), ['b', 'c']);
});

test('una fecha que no se puede leer no cuenta', () => {
  assert.deepEqual(registrosDeHoy([log('x', 'no-es-fecha')], new Date('2026-10-05T10:00:00.000Z')), []);
});

test('el saludo va por la hora de Madrid', () => {
  assert.equal(saludoDelEstudio(new Date('2026-10-05T10:30:00.000Z')), 'Buenos días');    // 12:30 Madrid
  assert.equal(saludoDelEstudio(new Date('2026-10-05T11:30:00.000Z')), 'Buenas tardes');  // 13:30 Madrid (11:30 UTC)
  assert.equal(saludoDelEstudio(new Date('2026-10-05T18:30:00.000Z')), 'Buenas noches');  // 20:30 Madrid
  assert.equal(saludoDelEstudio(new Date('2026-10-04T23:30:00.000Z')), 'Buenos días');    // 01:30 Madrid
  assert.equal(saludoDelEstudio(new Date('2026-01-15T18:30:00.000Z')), 'Buenas tardes');  // 19:30 Madrid en invierno
});
