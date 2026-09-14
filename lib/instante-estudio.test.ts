import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instanteEnEstudio } from './utils.ts';

test('una hora del estudio es la hora de Madrid, no la del servidor', () => {
  // Verano (CEST, +2) e invierno (CET, +1).
  assert.equal(instanteEnEstudio('2026-09-18', '10:00'), '2026-09-18T08:00:00.000Z');
  assert.equal(instanteEnEstudio('2026-12-10', '10:00'), '2026-12-10T09:00:00.000Z');
  // La medianoche del estudio cae el día anterior en UTC.
  assert.equal(instanteEnEstudio('2026-09-18', '00:30'), '2026-09-17T22:30:00.000Z');
});

test('el día del cambio de hora de primavera sale bien antes y después del salto', () => {
  // 29-mar-2026: a las 02:00 (hora de Madrid) el reloj pasa a las 03:00.
  assert.equal(instanteEnEstudio('2026-03-29', '01:30'), '2026-03-29T00:30:00.000Z');
  assert.equal(instanteEnEstudio('2026-03-29', '03:30'), '2026-03-29T01:30:00.000Z');
  // Las 02:30 de ese día no existen.
  assert.equal(instanteEnEstudio('2026-03-29', '02:30'), null);
});

test('fechas u horas que no existen o mal escritas no dan un instante', () => {
  assert.equal(instanteEnEstudio('2026-02-31', '10:00'), null);
  assert.equal(instanteEnEstudio('2026-09-18', '24:00'), null);
  assert.equal(instanteEnEstudio('2026-09-18', '9:00'), null);
  assert.equal(instanteEnEstudio('18/09/2026', '10:00'), null);
});
