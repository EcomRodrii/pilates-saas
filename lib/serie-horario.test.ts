// Tests de la reconstrucción de hora de una serie recurrente (I-3).
// Runner nativo de Node (sin dependencias): `npm test` (Node >= 22.6).
//
// Esto fija el contrato que la RPC editar_serie_desde (0114) implementa en SQL con
// `AT TIME ZONE 'Europe/Madrid'`: mantener la FECHA local de cada sesión y cambiar
// solo la hora de pared, cruzando el horario de verano correctamente. Si este test
// y la RPC divergen, el pintado optimista mentiría respecto a lo guardado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horarioConNuevaHora } from './serie-horario.ts';

// Madrid = UTC+1 en invierno (CET), UTC+2 en verano (CEST). DST 2026: 29-mar → 25-oct.

test('invierno (CET, +1): mantiene la fecha local y aplica la hora de pared', () => {
  // Sesión un martes de febrero (Madrid 13:00). Nueva hora 09:00–10:15.
  const r = horarioConNuevaHora('2026-02-10T12:00:00Z', '09:00', '10:15');
  assert.equal(r.inicio, '2026-02-10T08:00:00.000Z'); // 09:00 Madrid (+1) = 08:00Z
  assert.equal(r.fin, '2026-02-10T09:15:00.000Z'); // 10:15 Madrid (+1) = 09:15Z
});

test('verano (CEST, +2): el mismo cálculo con offset de verano', () => {
  const r = horarioConNuevaHora('2026-07-13T05:00:00Z', '09:00', '10:00');
  assert.equal(r.inicio, '2026-07-13T07:00:00.000Z'); // 09:00 Madrid (+2) = 07:00Z
  assert.equal(r.fin, '2026-07-13T08:00:00.000Z');
});

test('usa la fecha LOCAL, no el día UTC (banda de medianoche)', () => {
  // 22:30Z del 12-jul es, en Madrid (+2), el lunes 13-jul 00:30. La fecha que
  // manda es la local (13-jul), no la UTC (12-jul) — el bug que arregló 0105.
  const r = horarioConNuevaHora('2026-07-12T22:30:00Z', '07:00', '08:00');
  assert.equal(r.inicio, '2026-07-13T05:00:00.000Z'); // 07:00 del 13-jul, no del 12
  assert.equal(r.fin, '2026-07-13T06:00:00.000Z');
});

test('DST: la misma hora de pared en dos fechas de la serie da offset distinto', () => {
  // Es lo que un offset fijo se comería: anclar a Madrid por FECHA es lo correcto.
  const invierno = horarioConNuevaHora('2026-01-19T10:00:00Z', '09:00', '10:00');
  const verano = horarioConNuevaHora('2026-06-15T10:00:00Z', '09:00', '10:00');
  assert.equal(invierno.inicio, '2026-01-19T08:00:00.000Z'); // +1
  assert.equal(verano.inicio, '2026-06-15T07:00:00.000Z'); // +2
  // Misma hora de pared (09:00), una hora de diferencia en UTC.
  const difMin =
    (new Date('2026-01-19T08:00:00Z').getUTCHours() -
      new Date('2026-06-15T07:00:00Z').getUTCHours());
  assert.equal(difMin, 1);
});

test('el fin siempre es posterior al inicio en una clase normal', () => {
  const r = horarioConNuevaHora('2026-09-01T06:00:00Z', '18:30', '19:30');
  assert.ok(new Date(r.fin).getTime() > new Date(r.inicio).getTime());
});
