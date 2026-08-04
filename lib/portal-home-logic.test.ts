import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTiraSemana, calcularProgresoSemanal, META_PROGRESO_SEMANAL } from './portal-home-logic.ts';
import type { Reserva, Sesion } from './types.ts';

// Miércoles 2026-08-05, 10:00 — un día fijo a media semana para que "lunes de
// esta semana" (03-08) y "domingo" (09-08) sean deterministas en el test.
const AHORA = new Date(2026, 7, 5, 10, 0, 0);

function sesion(parcial: Partial<Sesion> & { id: string; inicio: string }): Sesion {
  return {
    studioId: 's1', tipoClaseId: 't1', salaId: 'sala1', instructorId: 'i1',
    fin: parcial.inicio, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null,
    ...parcial,
  };
}
function reserva(parcial: Partial<Reserva> & { sesionId: string }): Reserva {
  return {
    id: `r-${parcial.sesionId}`, studioId: 's1', socioId: 'socio1', estado: 'CONFIRMADA',
    spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: AHORA.toISOString(),
    ...parcial,
  };
}

test('calcularTiraSemana: 7 días de lunes a domingo, con "hoy" marcado', () => {
  const dias = calcularTiraSemana(AHORA, [], []);
  assert.equal(dias.length, 7);
  assert.deepEqual(dias.map((d) => d.indiceSemana), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(dias[0].fecha.getDate(), 3); // lunes 3
  assert.equal(dias[6].fecha.getDate(), 9); // domingo 9
  const hoy = dias.filter((d) => d.esHoy);
  assert.equal(hoy.length, 1);
  assert.equal(hoy[0].fecha.getDate(), 5); // miércoles 5
});

test('calcularTiraSemana: domingo también cae dentro de "esta semana" (getDay()=0 es el caso especial)', () => {
  const domingo = new Date(2026, 7, 9, 9, 0, 0);
  const dias = calcularTiraSemana(domingo, [], []);
  assert.equal(dias[0].fecha.getDate(), 3); // el lunes sigue siendo el 3
  assert.ok(dias[6].esHoy);
});

test('calcularTiraSemana: marca el punto solo en el día con una reserva CONFIRMADA', () => {
  const s = sesion({ id: 's-jue', inicio: new Date(2026, 7, 6, 18, 0).toISOString() }); // jueves 6
  const dias = calcularTiraSemana(AHORA, [reserva({ sesionId: s.id })], [s]);
  const conPunto = dias.filter((d) => d.tieneClaseReservada);
  assert.equal(conPunto.length, 1);
  assert.equal(conPunto[0].fecha.getDate(), 6);
});

test('calcularTiraSemana: una reserva CANCELADA/LISTA_ESPERA no pinta punto', () => {
  const s = sesion({ id: 's-vie', inicio: new Date(2026, 7, 7, 18, 0).toISOString() });
  const dias = calcularTiraSemana(AHORA, [reserva({ sesionId: s.id, estado: 'CANCELADA' })], [s]);
  assert.equal(dias.filter((d) => d.tieneClaseReservada).length, 0);
});

test('calcularTiraSemana: una reserva de la semana ANTERIOR o SIGUIENTE no cuenta', () => {
  const semanaAntes = sesion({ id: 's-antes', inicio: new Date(2026, 6, 27, 18, 0).toISOString() });
  const semanaDespues = sesion({ id: 's-despues', inicio: new Date(2026, 7, 12, 18, 0).toISOString() });
  const dias = calcularTiraSemana(AHORA, [
    reserva({ sesionId: semanaAntes.id }),
    reserva({ sesionId: semanaDespues.id }),
  ], [semanaAntes, semanaDespues]);
  assert.equal(dias.filter((d) => d.tieneClaseReservada).length, 0);
});

test('calcularProgresoSemanal: cuenta reservas, no días (dos clases el mismo día suman 2)', () => {
  const s1 = sesion({ id: 's1', inicio: new Date(2026, 7, 4, 9, 0).toISOString() });
  const s2 = sesion({ id: 's2', inicio: new Date(2026, 7, 4, 18, 0).toISOString() }); // mismo día, otra hora
  const n = calcularProgresoSemanal(AHORA, [reserva({ sesionId: s1.id }), reserva({ sesionId: s2.id })], [s1, s2]);
  assert.equal(n, 2);
});

test('calcularProgresoSemanal: 0 sin reservas de esta semana', () => {
  assert.equal(calcularProgresoSemanal(AHORA, [], []), 0);
});

test('calcularProgresoSemanal: solo cuenta CONFIRMADA', () => {
  const s = sesion({ id: 's-pend', inicio: new Date(2026, 7, 4, 9, 0).toISOString() });
  const n = calcularProgresoSemanal(AHORA, [reserva({ sesionId: s.id, estado: 'LISTA_ESPERA' })], [s]);
  assert.equal(n, 0);
});

test('META_PROGRESO_SEMANAL: número de referencia positivo (no una meta configurable)', () => {
  assert.ok(META_PROGRESO_SEMANAL > 0);
});
