import test from 'node:test';
import assert from 'node:assert/strict';
import { horarioDeSesion } from './construir-slots.ts';
import { celdaDe, franjasConClases } from './rejilla-semana.ts';
import { rejillaMes } from './rejilla-mes.ts';
import { fmtTime, fmtLong } from './formato.ts';
import {
  slotsDelDia, contarSlotsPorDia, agruparPorDia, etiquetaDiaClave, fechaDeClave, localDayKey,
} from '../reserva-calendario-logic.ts';

// RES-7-f (auditoría 25-sep): el canal público leía las clases con la zona del
// NAVEGADOR de quien mira, mientras la etiqueta y lo que se escribe van en Madrid.
// Estos casos son el mismo instante visto desde cualquier huso: se ejecutan con
// TZ=UTC, Europe/Madrid, America/Los_Angeles y Pacific/Auckland y tienen que dar
// LO MISMO en todos.

// 23:30 UTC del 4-ago = 01:30 del 5-ago en Madrid (CEST, +2).
const MADRUGADA = '2026-08-04T23:30:00.000Z';
// 08:00 UTC del 12-ago = 10:00 del 12-ago en Madrid.
const MAÑANA = '2026-08-12T08:00:00.000Z';

test('la franja es la del estudio: las 10:00 de Madrid son «mañana» y las 01:30 también', () => {
  assert.equal(horarioDeSesion(MAÑANA), 'manana');
  assert.equal(horarioDeSesion(MADRUGADA), 'manana');
  // 15:30 UTC = 17:30 Madrid → tarde (con getHours() en Los Ángeles era 08:30 → mañana).
  assert.equal(horarioDeSesion('2026-08-12T15:30:00.000Z'), 'tarde');
});

test('la celda de la rejilla semanal es el día y la hora del estudio', () => {
  // Miércoles 12-ago, 10:00 Madrid → columna 2 (lunes=0), fila 10.
  assert.deepEqual(celdaDe(MAÑANA), { diaSemana: 2, hora: 10 });
  // La madrugada del 5-ago (miércoles) sigue siendo MIÉRCOLES, no martes.
  assert.deepEqual(celdaDe(MADRUGADA), { diaSemana: 2, hora: 1 });
  assert.deepEqual(franjasConClases([{ id: 'a', inicio: MADRUGADA }, { id: 'b', inicio: MAÑANA }]), [1, 10]);
});

test('el día de una clase es el del estudio: la de 01:30 del 5-ago cuenta para el 5, no para el 4', () => {
  const slots = [{ id: 'a', inicio: MADRUGADA }, { id: 'b', inicio: MAÑANA }];
  assert.deepEqual(slotsDelDia(slots, '2026-08-05').map(s => s.id), ['a']);
  assert.deepEqual(slotsDelDia(slots, '2026-08-04').map(s => s.id), []);
  assert.deepEqual([...contarSlotsPorDia(slots)], [['2026-08-05', 1], ['2026-08-12', 1]]);
  assert.deepEqual(agruparPorDia(slots).map(g => g.dayKey), ['2026-08-05', '2026-08-12']);
});

test('la vista Mes cuenta la clase de madrugada en el día del estudio', () => {
  const dias = rejillaMes(new Date(2026, 7, 1), [{ inicio: MADRUGADA, aforoMaximo: 10, ocupadas: 2 }], new Date(2026, 7, 1));
  assert.equal(dias.find(d => d.fecha === '2026-08-05')?.clases, 1);
  assert.equal(dias.find(d => d.fecha === '2026-08-04')?.clases, 0);
});

test('la hora y la fecha que se enseñan son las del estudio', () => {
  assert.equal(fmtTime(MAÑANA), '10:00');
  assert.equal(fmtTime(MADRUGADA), '01:30');
  assert.match(fmtLong(new Date(MADRUGADA)), /5 de agosto/);
});

test('las claves de día: fechaDeClave y localDayKey son inversas, y las etiquetas se cuentan desde «hoy» del estudio', () => {
  assert.equal(localDayKey(fechaDeClave('2026-08-05')), '2026-08-05');
  assert.equal(etiquetaDiaClave('2026-08-05', '2026-08-05'), 'Hoy');
  assert.equal(etiquetaDiaClave('2026-08-06', '2026-08-05'), 'Mañana');
  assert.match(etiquetaDiaClave('2026-08-12', '2026-08-05'), /12/);
});
