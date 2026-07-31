import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioSemana, rangoDia, rangoSemana, claveRango } from './calendario-rango.ts';

// 2026-07-15 es miércoles.
const MIERCOLES = new Date(2026, 6, 15, 14, 30);
// 2026-07-19 es domingo.
const DOMINGO = new Date(2026, 6, 19, 9, 0);

test('inicioSemana: desde un miércoles, cae en el lunes de esa misma semana', () => {
  const l = inicioSemana(MIERCOLES);
  assert.equal(l.getDay(), 1);
  assert.equal(l.getDate(), 13);
  assert.equal(l.getHours(), 0);
});

test('inicioSemana: desde un domingo, cae en el lunes ANTERIOR (no en el siguiente)', () => {
  const l = inicioSemana(DOMINGO);
  assert.equal(l.getDay(), 1);
  assert.equal(l.getDate(), 13);
});

test('rangoDia: hasta - desde son exactamente 24h', () => {
  const { desde, hasta } = rangoDia(MIERCOLES);
  assert.equal(new Date(hasta).getTime() - new Date(desde).getTime(), 24 * 60 * 60 * 1000);
});

test('rangoDia: desde queda a medianoche del día pedido', () => {
  const { desde } = rangoDia(MIERCOLES);
  const d = new Date(desde);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getDate(), 15);
});

test('rangoSemana: hasta - desde son exactamente 7 días', () => {
  const { desde, hasta } = rangoSemana(MIERCOLES);
  assert.equal(new Date(hasta).getTime() - new Date(desde).getTime(), 7 * 24 * 60 * 60 * 1000);
});

test('claveRango: mismo rango produce la misma clave (cache-hit)', () => {
  const r1 = rangoSemana(MIERCOLES);
  const r2 = rangoSemana(new Date(2026, 6, 16)); // jueves de la MISMA semana
  assert.equal(claveRango(r1), claveRango(r2));
});

test('claveRango: semanas distintas producen claves distintas', () => {
  const r1 = rangoSemana(MIERCOLES);
  const r2 = rangoSemana(addDaysTest(MIERCOLES, 7));
  assert.notEqual(claveRango(r1), claveRango(r2));
});

function addDaysTest(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
