import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioDelPeriodo, rangoDelInforme, diasEntre } from './periodo.ts';

test('semana de lunes a domingo', () => {
  assert.equal(inicioDelPeriodo('week', '2026-10-01'), '2026-09-28'); // jueves
  assert.equal(inicioDelPeriodo('week', '2026-09-28'), '2026-09-28'); // lunes
  assert.equal(inicioDelPeriodo('week', '2026-10-04'), '2026-09-28'); // domingo
});

test('mes, últimos 3 meses y año, también cruzando de año', () => {
  assert.equal(inicioDelPeriodo('month', '2026-10-31'), '2026-10-01');
  assert.equal(inicioDelPeriodo('quarter', '2026-10-15'), '2026-08-01');
  assert.equal(inicioDelPeriodo('quarter', '2026-02-10'), '2025-12-01');
  assert.equal(inicioDelPeriodo('quarter', '2026-01-01'), '2025-11-01');
  assert.equal(inicioDelPeriodo('year', '2026-03-29'), '2026-01-01');
});

test('el periodo anterior dura lo mismo y acaba el día antes', () => {
  const r = rangoDelInforme('month', '2026-10-15');
  assert.deepEqual(r, {
    desde: '2026-10-01', hasta: '2026-10-15', inicioMes: '2026-10-01',
    anteriorDesde: '2026-09-16', anteriorHasta: '2026-09-30',
  });
  assert.equal(diasEntre(r.anteriorDesde, r.anteriorHasta), diasEntre(r.desde, r.hasta));
});

test('el día 1 del mes el periodo es ese único día', () => {
  const r = rangoDelInforme('month', '2026-11-01');
  assert.equal(r.desde, '2026-11-01');
  assert.equal(r.anteriorDesde, '2026-10-31');
  assert.equal(r.anteriorHasta, '2026-10-31');
});

test('no depende del reloj ni de la zona horaria del proceso', () => {
  // Sin `Date` local: el resultado es el mismo con TZ=UTC o TZ=America/Montreal.
  assert.equal(inicioDelPeriodo('week', '2026-03-29'), '2026-03-23');
  assert.equal(inicioDelPeriodo('week', '2026-10-25'), '2026-10-19');
});
