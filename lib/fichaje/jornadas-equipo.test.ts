import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aJornadaEquipo, instructorasGestionables, rangoMesEstudio, resumirPorInstructora } from './jornadas-equipo.ts';
import type { Rol } from '../types';

test('el mes empieza y acaba a medianoche de Madrid, con horario de verano e invierno', () => {
  // Septiembre (CEST, UTC+2): del 31-ago 22:00 UTC al 30-sep 22:00 UTC.
  assert.deepEqual(rangoMesEstudio(2026, 9), { desde: '2026-08-31T22:00:00.000Z', hasta: '2026-09-30T22:00:00.000Z' });
  // Octubre cruza el cambio de hora: empieza en verano (UTC+2) y acaba en invierno (UTC+1).
  assert.deepEqual(rangoMesEstudio(2026, 10), { desde: '2026-09-30T22:00:00.000Z', hasta: '2026-10-31T23:00:00.000Z' });
  // Diciembre pasa al año siguiente.
  assert.deepEqual(rangoMesEstudio(2026, 12), { desde: '2026-11-30T23:00:00.000Z', hasta: '2026-12-31T23:00:00.000Z' });
});

test('mes o año no válidos: null (la ruta responde 400)', () => {
  for (const [a, m] of [[2026, 0], [2026, 13], [2026, 1.5], [NaN, 3], [1999, 5]]) {
    assert.equal(rangoMesEstudio(a, m), null, `${a}/${m}`);
  }
});

const AHORA = new Date('2026-09-21T12:00:00.000Z');
const fila = (o: Partial<Parameters<typeof aJornadaEquipo>[0]>) => ({
  id: 'j', instructor_id: 'i1', check_in_at: '2026-09-21T08:00:00.000Z', check_out_at: null,
  status: 'OPEN' as const, edited_at: null, ...o,
});

test('duración solo de las cerradas; «a revisar» si lleva abierta más del límite', () => {
  const cerrada = aJornadaEquipo(fila({ status: 'CLOSED', check_out_at: '2026-09-21T12:30:00.000Z' }), AHORA, 12);
  assert.equal(cerrada.minutos, 270); assert.equal(cerrada.requiereRevision, false);
  const abierta = aJornadaEquipo(fila({}), AHORA, 12);
  assert.equal(abierta.minutos, null); assert.equal(abierta.requiereRevision, false);
  const olvidada = aJornadaEquipo(fila({ check_in_at: '2026-09-20T20:00:00.000Z' }), AHORA, 12);
  assert.equal(olvidada.requiereRevision, true);
  assert.equal(aJornadaEquipo(fila({}), AHORA, 3).requiereRevision, true, 'respeta el límite del estudio');
  assert.equal(aJornadaEquipo(fila({ edited_at: '2026-09-21T13:00:00.000Z' }), AHORA, 12).corregida, true);
});

test('totales por instructora: suma solo lo cerrado, cuenta abiertas y a revisar', () => {
  const js = [
    aJornadaEquipo(fila({ id: 'a', status: 'CLOSED', check_out_at: '2026-09-21T10:00:00.000Z' }), AHORA, 12),
    aJornadaEquipo(fila({ id: 'b', status: 'CLOSED', check_in_at: '2026-09-20T08:00:00.000Z', check_out_at: '2026-09-20T08:45:00.000Z' }), AHORA, 12),
    aJornadaEquipo(fila({ id: 'c', check_in_at: '2026-09-20T20:00:00.000Z' }), AHORA, 12),
    aJornadaEquipo(fila({ id: 'd', instructor_id: 'i2', status: 'CLOSED', check_out_at: '2026-09-21T09:00:00.000Z' }), AHORA, 12),
  ];
  const r = Object.fromEntries(resumirPorInstructora(js).map((x) => [x.instructorId, x]));
  assert.deepEqual(r.i1, { instructorId: 'i1', minutos: 165, jornadas: 3, abiertas: 1, aRevisar: 1 });
  assert.deepEqual(r.i2, { instructorId: 'i2', minutos: 60, jornadas: 1, abiertas: 0, aRevisar: 0 });
});

test('la gerente solo ve y corrige las horas de instructoras y recepción; la propietaria, las de todas', () => {
  const roles = new Map<string, Rol>([['dueña', 'PROPIETARIO'], ['ger', 'MANAGER'], ['rec', 'RECEPCION'], ['ins', 'INSTRUCTOR']]);
  assert.deepEqual(instructorasGestionables('MANAGER', roles).sort(), ['ins', 'rec']);
  assert.deepEqual(instructorasGestionables('PROPIETARIO', roles).sort(), ['dueña', 'ger', 'ins', 'rec']);
  assert.deepEqual(instructorasGestionables('RECEPCION', roles), []);
  assert.deepEqual(instructorasGestionables('INSTRUCTOR', roles), []);
});
