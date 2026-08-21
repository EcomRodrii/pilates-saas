import test from 'node:test';
import assert from 'node:assert/strict';
import { hoyEnEstudio } from './utils.ts';

test('⚠️ el caso real: 23:33 UTC ya es el día siguiente en España', () => {
  // El pago que destapó esto: 2026-08-20T23:33 UTC = 2026-08-21 01:33 en Madrid.
  // `toISOString().slice(0,10)` decía «20 de agosto» y fechaba el recibo un día
  // antes de cuando lo vivieron la clienta y la propietaria.
  assert.equal(hoyEnEstudio(new Date('2026-08-20T23:33:35Z')), '2026-08-21');
  assert.notEqual(hoyEnEstudio(new Date('2026-08-20T23:33:35Z')), new Date('2026-08-20T23:33:35Z').toISOString().slice(0, 10));
});

test('en horario de verano (UTC+2) el corte es a las 22:00 UTC', () => {
  assert.equal(hoyEnEstudio(new Date('2026-08-20T21:59:00Z')), '2026-08-20');
  assert.equal(hoyEnEstudio(new Date('2026-08-20T22:00:00Z')), '2026-08-21');
});

test('en horario de invierno (UTC+1) el corte es a las 23:00 UTC', () => {
  // Enero: Madrid va una hora por delante, no dos.
  assert.equal(hoyEnEstudio(new Date('2026-01-15T22:59:00Z')), '2026-01-15');
  assert.equal(hoyEnEstudio(new Date('2026-01-15T23:00:00Z')), '2026-01-16');
});

test('el formato es el que espera una columna date de Postgres', () => {
  assert.match(hoyEnEstudio(new Date('2026-03-05T10:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hoyEnEstudio(new Date('2026-03-05T10:00:00Z')), '2026-03-05');
});
