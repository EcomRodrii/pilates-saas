import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuentaComoHecha, lunesDe, semanaDe, hechasEstaSemana, rachaSemanas } from './ritmo.ts';

// 2026-09-04 es VIERNES. Toda la batería cuelga de esa fecha.
const HOY = '2026-09-04';

test('lunesDe: el lunes de un viernes es el lunes de esa semana', () => {
  assert.equal(lunesDe('2026-09-04'), '2026-08-31');
});

test('lunesDe: un DOMINGO pertenece a la semana que empieza el lunes anterior', () => {
  // El fallo clásico: `getDay()` da 0 el domingo y lo manda a la semana
  // siguiente. Aquí el domingo 6 tiene que caer en la semana del lunes 31.
  assert.equal(lunesDe('2026-09-06'), '2026-08-31');
});

test('lunesDe: un lunes es su propio lunes', () => {
  assert.equal(lunesDe('2026-08-31'), '2026-08-31');
});

test('cuentaComoHecha: asistida siempre cuenta', () => {
  assert.equal(cuentaComoHecha({ fecha: '2026-09-01', estado: 'asistida' }, HOY), true);
});

test('cuentaComoHecha: confirmada YA PASADA cuenta — muchos estudios no pasan lista', () => {
  assert.equal(cuentaComoHecha({ fecha: '2026-09-01', estado: 'confirmada' }, HOY), true);
});

test('cuentaComoHecha: confirmada FUTURA no cuenta todavía', () => {
  assert.equal(cuentaComoHecha({ fecha: '2026-09-30', estado: 'confirmada' }, HOY), false);
});

test('cuentaComoHecha: cancelada y no-asistida nunca cuentan', () => {
  assert.equal(cuentaComoHecha({ fecha: '2026-09-01', estado: 'cancelada' }, HOY), false);
  assert.equal(cuentaComoHecha({ fecha: '2026-09-01', estado: 'no-asistida' }, HOY), false);
});

test('semanaDe: siete días, de lunes a domingo, con las letras del diseño', () => {
  const s = semanaDe([], HOY);
  assert.equal(s.length, 7);
  assert.deepEqual(s.map((d) => d.letra), ['L', 'M', 'X', 'J', 'V', 'S', 'D']);
  assert.equal(s[0].fecha, '2026-08-31');
  assert.equal(s[6].fecha, '2026-09-06');
});

test('semanaDe: marca hoy y solo hoy', () => {
  const s = semanaDe([], HOY);
  assert.deepEqual(s.filter((d) => d.esHoy).map((d) => d.fecha), [HOY]);
});

test('semanaDe: marca los días con clase hecha, no los futuros', () => {
  const s = semanaDe([
    { fecha: '2026-08-31', estado: 'asistida' },
    { fecha: '2026-09-02', estado: 'confirmada' },  // pasada → cuenta
    { fecha: '2026-09-05', estado: 'confirmada' },  // futura → no
  ], HOY);
  assert.deepEqual(s.filter((d) => d.hecha).map((d) => d.letra), ['L', 'X']);
});

test('hechasEstaSemana: no cuenta las de otras semanas', () => {
  const clases = [
    { fecha: '2026-08-24', estado: 'asistida' },  // semana anterior
    { fecha: '2026-08-31', estado: 'asistida' },
    { fecha: '2026-09-02', estado: 'asistida' },
  ];
  assert.equal(hechasEstaSemana(clases, HOY), 2);
});

test('racha: tres semanas seguidas dan 3', () => {
  const clases = [
    { fecha: '2026-08-31', estado: 'asistida' },  // semana en curso
    { fecha: '2026-08-25', estado: 'asistida' },  // -1
    { fecha: '2026-08-18', estado: 'asistida' },  // -2
  ];
  assert.equal(rachaSemanas(clases, HOY), 3);
});

test('racha: un hueco la corta', () => {
  const clases = [
    { fecha: '2026-08-31', estado: 'asistida' },
    // sin nada la semana del 24
    { fecha: '2026-08-18', estado: 'asistida' },
  ];
  assert.equal(rachaSemanas(clases, HOY), 1);
});

test('racha: la semana EN CURSO sin clase no rompe lo anterior', () => {
  // Es lo que evita que la racha desaparezca cada lunes por la mañana y vuelva
  // el martes. Aún no ha ido esta semana, pero no la ha perdido.
  const clases = [
    { fecha: '2026-08-25', estado: 'asistida' },  // -1
    { fecha: '2026-08-18', estado: 'asistida' },  // -2
  ];
  assert.equal(rachaSemanas(clases, HOY), 2);
});

test('racha: sin clases es 0, no 1', () => {
  assert.equal(rachaSemanas([], HOY), 0);
});

test('racha: las canceladas no sostienen la racha', () => {
  const clases = [
    { fecha: '2026-08-31', estado: 'cancelada' },
    { fecha: '2026-08-25', estado: 'cancelada' },
  ];
  assert.equal(rachaSemanas(clases, HOY), 0);
});
