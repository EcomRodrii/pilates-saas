import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  edadEnFecha, esMenorDeEdadConsentimiento, consentimientoSaludPorEdad, normalizarFechaNacimiento,
  EDAD_MINIMA_CONSENTIMIENTO_SALUD,
} from './edad.ts';

test('el umbral es 14 (LOPDGDD art. 7) mientras no diga otra cosa el dictamen', () => {
  assert.equal(EDAD_MINIMA_CONSENTIMIENTO_SALUD, 14);
});

test('cumpleaños HOY: ese mismo día ya los cumple; la víspera, todavía no', () => {
  assert.equal(edadEnFecha('2012-09-14', '2026-09-14'), 14);
  assert.equal(esMenorDeEdadConsentimiento('2012-09-14', '2026-09-14'), false);
  assert.equal(edadEnFecha('2012-09-14', '2026-09-13'), 13);
  assert.equal(esMenorDeEdadConsentimiento('2012-09-14', '2026-09-13'), true);
});

test('29 de febrero: en año no bisiesto se cumple el 1 de marzo, nunca el 28', () => {
  assert.equal(edadEnFecha('2012-02-29', '2026-02-28'), 13);
  assert.equal(edadEnFecha('2012-02-29', '2026-03-01'), 14);
  // Año bisiesto: el propio 29.
  assert.equal(edadEnFecha('2012-02-29', '2040-02-29'), 28);
  assert.equal(edadEnFecha('2012-02-29', '2040-02-28'), 27);
  // Hoy es 29 de febrero y nació el 1 de marzo: aún no.
  assert.equal(edadEnFecha('2014-03-01', '2028-02-29'), 13);
});

test('«hoy» es el día de Madrid, no el de UTC', () => {
  // 22:30 UTC del 13 = 00:30 del 14 en Madrid (horario de verano).
  const madrugada = new Date('2026-09-13T22:30:00Z');
  assert.equal(edadEnFecha('2012-09-14', madrugada), 14);
  assert.equal(esMenorDeEdadConsentimiento('2012-09-14', madrugada), false);
});

test('fecha inválida: NO se asume menor, pero se pide la fecha', () => {
  for (const mala of [null, undefined, '', 'abc', '14/09/2012', '2023-02-29', '2012-13-01', 20120914, '2030-01-01']) {
    assert.equal(edadEnFecha(mala, '2026-09-14'), null, String(mala));
    assert.equal(esMenorDeEdadConsentimiento(mala, '2026-09-14'), false, String(mala));
    assert.equal(consentimientoSaludPorEdad(mala, '2026-09-14'), 'FALTA_FECHA', String(mala));
  }
  // Un «hoy» que no sirve tampoco inventa una edad.
  assert.equal(edadEnFecha('2000-01-01', new Date('no')), null);
});

test('consentimientoSaludPorEdad: menor, adulta, y una edad imposible cuenta como sin fecha', () => {
  assert.equal(consentimientoSaludPorEdad('2015-01-01', '2026-09-14'), 'MENOR');
  assert.equal(consentimientoSaludPorEdad('1990-05-20', '2026-09-14'), 'PUEDE');
  assert.equal(consentimientoSaludPorEdad('1880-01-01', '2026-09-14'), 'FALTA_FECHA');
});

test('normalizarFechaNacimiento: recorta, y rechaza futuro, basura y edades imposibles', () => {
  assert.equal(normalizarFechaNacimiento(' 1990-05-20 ', '2026-09-14'), '1990-05-20');
  assert.equal(normalizarFechaNacimiento('2027-01-01', '2026-09-14'), null);
  assert.equal(normalizarFechaNacimiento('1880-01-01', '2026-09-14'), null);
  assert.equal(normalizarFechaNacimiento('2023-02-29', '2026-09-14'), null);
  assert.equal(normalizarFechaNacimiento({}, '2026-09-14'), null);
});
