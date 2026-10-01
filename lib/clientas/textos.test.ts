import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoClase, cuandoSera, diasEntre, fechaCorta, haceCuanto, proximoCumple, telefonoLegible, textoDesde } from './textos.ts';

const HOY = '2026-10-01';

test('fechas cortas: el año solo si no es este', () => {
  assert.equal(fechaCorta('2026-09-12', HOY), '12 sep');
  assert.equal(fechaCorta('2025-03-02', HOY), '2 mar 2025');
});

test('hace cuánto, en palabras', () => {
  assert.equal(haceCuanto('2026-10-01', HOY), 'hoy');
  assert.equal(haceCuanto('2026-09-30', HOY), 'ayer');
  assert.equal(haceCuanto('2026-09-26', HOY), 'hace 5 días');
  assert.equal(haceCuanto('2026-09-10', HOY), 'hace 3 semanas');
  assert.equal(haceCuanto('2026-06-01', HOY), 'hace 4 meses');
  assert.equal(haceCuanto('2025-06-01', HOY), 'hace más de un año');
});

test('cuándo será', () => {
  assert.equal(cuandoSera('2026-10-02', HOY), 'mañana');
  assert.equal(cuandoSera('2026-10-03', HOY, 'sáb'), 'el sáb 3');
  assert.equal(cuandoSera('2026-10-20', HOY), 'el 20 oct');
});

test('el complemento de cada estado', () => {
  assert.equal(textoDesde({ estado: 'ACTIVA', desde: '2025-03-12', nueva: false }, HOY), 'desde mar 2025');
  assert.equal(textoDesde({ estado: 'ACTIVA', desde: '2026-09-22', nueva: true }, HOY), 'nueva · hace 9 días');
  assert.equal(textoDesde({ estado: 'DE_PRUEBA', desde: '2026-09-26', nueva: false }, HOY), 'vino el 26 sep');
  assert.equal(textoDesde({ estado: 'DE_PRUEBA', desde: '2026-10-04', nueva: false }, HOY), 'prueba el 4 oct');
  assert.equal(textoDesde({ estado: 'SIN_RENOVAR', desde: '2026-09-19', nueva: false }, HOY), 'desde hace 12 días');
  assert.equal(textoDesde({ estado: 'INACTIVA', desde: '2026-06-01', nueva: false }, HOY), 'desde jun 2026');
  assert.equal(textoDesde({ estado: 'DE_BAJA', desde: null, nueva: false }, HOY), null);
});

test('cuándo es una clase, en hora de Madrid', () => {
  assert.equal(cuandoClase('2026-10-01T16:00:00Z', HOY), 'hoy 18:00');
  assert.equal(cuandoClase('2026-10-02T07:30:00Z', HOY), 'mañana 9:30');
  assert.equal(cuandoClase('2026-10-03T16:00:00Z', HOY), 'sáb 18:00');
  assert.equal(cuandoClase('2026-10-14T16:00:00Z', HOY), '14 oct 18:00');
  // 23:30 de Madrid del día 1 es todavía «hoy», aunque en UTC sean las 21:30.
  assert.equal(cuandoClase('2026-10-01T21:30:00Z', HOY), 'hoy 23:30');
});

test('días entre fechas y cumpleaños de esta semana', () => {
  assert.equal(diasEntre('2026-09-26', '2026-10-01'), 5);
  assert.equal(proximoCumple('10-01', HOY), 'hoy');
  assert.equal(proximoCumple('10-02', HOY), 'mañana');
  assert.equal(proximoCumple('10-03', HOY), 'el sábado');
  assert.equal(proximoCumple('10-09', HOY), null);
  assert.equal(proximoCumple(null, HOY), null);
});

test('el teléfono, agrupado como se dice; lo que no es un número español, tal cual', () => {
  assert.equal(telefonoLegible('600333444'), '600 333 444');
  assert.equal(telefonoLegible('+34600333444'), '+34 600 333 444');
  assert.equal(telefonoLegible('600-33-34-44'), '600 333 444');
  assert.equal(telefonoLegible('+44 7700 900123'), '+44 7700 900123');
});

test('de baja: cuándo y por qué, si se sabe; sin su baja guardada, nada (no se inventa)', () => {
  const deBaja = { estado: 'DE_BAJA' as const, desde: null, nueva: false };
  assert.equal(textoDesde(deBaja, HOY, { baja: { motivo: 'SE_MUDA', bajaEn: '2026-09-12T10:00:00Z' } }), 'desde 12 sep · se muda');
  assert.equal(textoDesde(deBaja, HOY), null);
  assert.equal(textoDesde(deBaja, HOY, { baja: { motivo: 'RARO', bajaEn: '2026-09-12T10:00:00Z' } }), 'desde 12 sep');
});
