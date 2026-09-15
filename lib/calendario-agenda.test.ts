import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaDeDia, agendaDeSemana } from './calendario-agenda.ts';
import type { ColumnaDia, ColumnaSala, SesionEnColumna } from './calendario-columnas.ts';
import type { Sala } from './types.ts';

const ses = (id: string, inicioMin: number, finMin: number, salaId = 'norte'): SesionEnColumna => ({
  id, inicioMin, finMin, salaId, estado: 'PROGRAMADA', confirmadas: 0, enEspera: 0, aforoMaximo: 8,
  finalizada: false, carril: 0, totalCarriles: 1,
});
const sala = (id: string): Sala => ({ id, studioId: 'e1', nombre: 'Sala ' + id, capacidad: 8, color: '#000' });
const dia = (n: number, sesiones: SesionEnColumna[], cerrado = false): ColumnaDia => ({
  dia: n, sesiones, ocupacionMedia: 0, hayAtencion: false, vacio: sesiones.length === 0, cerrado,
});
const columnaSala = (id: string, sesiones: SesionEnColumna[]): ColumnaSala => ({
  sala: sala(id), sesiones, ocupacionMedia: 0, hayAtencion: false,
});

test('la semana: un día por columna y sus clases por hora, aunque lleguen desordenadas', () => {
  const agenda = agendaDeSemana([
    dia(0, [ses('tarde', 18 * 60, 18 * 60 + 50), ses('manana', 9 * 60, 9 * 60 + 50)]),
    dia(1, [ses('mediodia', 13 * 60, 14 * 60)]),
  ]);
  assert.deepEqual(agenda, [
    { indice: 0, cerrado: false, ids: ['manana', 'tarde'] },
    { indice: 1, cerrado: false, ids: ['mediodia'] },
  ]);
});

test('un día cerrado o sin clases sigue en la semana, vacío', () => {
  const agenda = agendaDeSemana([dia(0, []), dia(1, [], true)]);
  assert.deepEqual(agenda.map((d) => [d.indice, d.cerrado, d.ids.length]), [[0, false, 0], [1, true, 0]]);
});

test('no toca las columnas que recibe: la rejilla sigue usándolas tal cual', () => {
  const sesiones = [ses('b', 600, 650), ses('a', 540, 590)];
  agendaDeSemana([dia(0, sesiones)]);
  assert.deepEqual(sesiones.map((s) => s.id), ['b', 'a']);
});

test('el día junta las salas y las ordena por hora', () => {
  const ids = agendaDeDia([
    columnaSala('norte', [ses('n11', 11 * 60, 12 * 60, 'norte'), ses('n9', 9 * 60, 10 * 60, 'norte')]),
    columnaSala('sur', [ses('s10', 10 * 60, 11 * 60, 'sur')]),
  ]);
  assert.deepEqual(ids, ['n9', 's10', 'n11']);
});

test('a la misma hora, primero la que acaba antes; si también coincide, el orden de las salas', () => {
  const ids = agendaDeDia([
    columnaSala('norte', [ses('norte-larga', 600, 690, 'norte'), ses('norte-corta', 600, 645, 'norte')]),
    columnaSala('sur', [ses('sur-larga', 600, 690, 'sur')]),
  ]);
  assert.deepEqual(ids, ['norte-corta', 'norte-larga', 'sur-larga']);
});

test('en la semana, a igual hora manda el orden de salas que se le pase', () => {
  const agenda = agendaDeSemana([dia(0, [ses('en-sur', 600, 650, 'sur'), ses('en-norte', 600, 650, 'norte')])], ['norte', 'sur']);
  assert.deepEqual(agenda[0].ids, ['en-norte', 'en-sur']);
});

test('sin columnas no hay nada que listar', () => {
  assert.deepEqual(agendaDeSemana([]), []);
  assert.deepEqual(agendaDeDia([]), []);
});
