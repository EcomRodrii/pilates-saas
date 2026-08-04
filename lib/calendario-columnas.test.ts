import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararColumnasSalaDia, prepararColumnasDiaSemana, type SesionColumna, type SesionSemana } from './calendario-columnas.ts';
import type { Sala } from './types.ts';

const sala = (o: Partial<Sala> & Pick<Sala, 'id'>): Sala => ({
  studioId: 'e1', nombre: 'Sala ' + o.id, capacidad: 8, color: '#000', ...o,
});

const ses = (o: Partial<SesionColumna> & Pick<SesionColumna, 'id' | 'salaId'>): SesionColumna => ({
  inicioMin: 480, finMin: 540, estado: 'PROGRAMADA', confirmadas: 4, enEspera: 0, aforoMaximo: 8, ...o,
});

test('agrupa por sala, respetando el filtro "todas"', () => {
  const salas = [sala({ id: 'norte' }), sala({ id: 'sur' })];
  const cols = prepararColumnasSalaDia(
    [ses({ id: 's1', salaId: 'norte' }), ses({ id: 's2', salaId: 'sur' })],
    salas, 'todas',
  );
  assert.equal(cols.length, 2);
  assert.equal(cols[0].sesiones.length, 1);
  assert.equal(cols[1].sesiones.length, 1);
});

test('filtro por una sala concreta reduce las columnas (punto 9)', () => {
  const salas = [sala({ id: 'norte' }), sala({ id: 'sur' })];
  const cols = prepararColumnasSalaDia(
    [ses({ id: 's1', salaId: 'norte' }), ses({ id: 's2', salaId: 'sur' })],
    salas, 'norte',
  );
  assert.equal(cols.length, 1);
  assert.equal(cols[0].sala.id, 'norte');
});

test('sala sin clases: 0 sesiones, ocupacionMedia 0, sin atención', () => {
  const cols = prepararColumnasSalaDia([], [sala({ id: 'norte' })], 'todas');
  assert.equal(cols[0].sesiones.length, 0);
  assert.equal(cols[0].ocupacionMedia, 0);
  assert.equal(cols[0].hayAtencion, false);
});

test('dos clases que chocan en la misma sala reciben carriles distintos', () => {
  const cols = prepararColumnasSalaDia(
    [ses({ id: 'a', salaId: 'norte', inicioMin: 480, finMin: 540 }), ses({ id: 'b', salaId: 'norte', inicioMin: 500, finMin: 560 })],
    [sala({ id: 'norte' })], 'todas',
  );
  const [a, b] = cols[0].sesiones;
  assert.notEqual(a.carril, b.carril);
  assert.equal(a.totalCarriles, 2);
});

test('ocupacionMedia es la media simple de ratios de la sala', () => {
  const cols = prepararColumnasSalaDia(
    [
      ses({ id: 'a', salaId: 'norte', confirmadas: 8, aforoMaximo: 8 }),  // 1.0
      ses({ id: 'b', salaId: 'norte', confirmadas: 0, aforoMaximo: 8 }),  // 0.0
    ],
    [sala({ id: 'norte' })], 'todas',
  );
  assert.equal(cols[0].ocupacionMedia, 0.5);
});

test('hayAtencion se enciende por sobreaforo (aforoMaximo > capacidad de la sala)', () => {
  const cols = prepararColumnasSalaDia(
    [ses({ id: 'a', salaId: 'norte', aforoMaximo: 12 })], // capacidad de la sala es 8
    [sala({ id: 'norte', capacidad: 8 })], 'todas',
  );
  assert.equal(cols[0].hayAtencion, true);
});

test('hayAtencion se enciende por lista de espera, aunque el estado sea PROGRAMADA', () => {
  const cols = prepararColumnasSalaDia(
    [ses({ id: 'a', salaId: 'norte', enEspera: 2 })],
    [sala({ id: 'norte' })], 'todas',
  );
  assert.equal(cols[0].hayAtencion, true);
});

test('hayAtencion se apaga si todas las clases están CANCELADA, aunque tengan sobreaforo', () => {
  const cols = prepararColumnasSalaDia(
    [ses({ id: 'a', salaId: 'norte', estado: 'CANCELADA', aforoMaximo: 20 })],
    [sala({ id: 'norte', capacidad: 8 })], 'todas',
  );
  assert.equal(cols[0].hayAtencion, false);
});

test('hayAtencion NO se enciende por lista de espera si la clase está llena (sin hueco libre) — no hay overselling', () => {
  const cols = prepararColumnasSalaDia(
    [ses({ id: 'a', salaId: 'norte', enEspera: 3, confirmadas: 8, aforoMaximo: 8 })],
    [sala({ id: 'norte' })], 'todas',
  );
  assert.equal(cols[0].hayAtencion, false);
});

// ── prepararColumnasDiaSemana ────────────────────────────────────────────────

const sesSemana = (o: Partial<SesionSemana> & Pick<SesionSemana, 'id' | 'dia'>): SesionSemana => ({
  salaId: 'norte', inicioMin: 480, finMin: 540, estado: 'PROGRAMADA', confirmadas: 4, enEspera: 0, aforoMaximo: 8, ...o,
});

test('siempre devuelve las 7 columnas, aunque no haya clases', () => {
  const cols = prepararColumnasDiaSemana([]);
  assert.equal(cols.length, 7);
  assert.deepEqual(cols.map(c => c.dia), [0, 1, 2, 3, 4, 5, 6]);
});

test('un día sin clases se marca "vacío" — no implica "cerrado"', () => {
  const cols = prepararColumnasDiaSemana([sesSemana({ id: 'a', dia: 0 })]);
  assert.equal(cols[0].vacio, false);
  assert.equal(cols[6].vacio, true); // domingo, sin nada en el fixture
  assert.equal(cols[6].cerrado, false); // sin horarioSemana, nunca se afirma "cerrado" sin dato real
});

test('sin horarioSemana ningún día se marca "cerrado", tenga o no clases', () => {
  const cols = prepararColumnasDiaSemana([sesSemana({ id: 'a', dia: 0 })]);
  assert.ok(cols.every(c => c.cerrado === false));
});

test('horarioSemana marca "cerrado" solo los días que el estudio no abre, independientemente de vacio', () => {
  const cols = prepararColumnasDiaSemana(
    [sesSemana({ id: 'a', dia: 6 })], // domingo, con una clase igualmente
    [
      { dia: 0, abierto: true }, { dia: 1, abierto: true }, { dia: 2, abierto: true },
      { dia: 3, abierto: true }, { dia: 4, abierto: true }, { dia: 5, abierto: false },
      { dia: 6, abierto: false },
    ],
  );
  assert.equal(cols[5].vacio, true);
  assert.equal(cols[5].cerrado, true); // sábado: cerrado y sin clases
  assert.equal(cols[6].vacio, false);
  assert.equal(cols[6].cerrado, true); // domingo: cerrado PERO con una clase — dos señales independientes
  assert.equal(cols[0].cerrado, false); // lunes: abierto
});

test('las sesiones de distintos días no se mezclan en los carriles', () => {
  const cols = prepararColumnasDiaSemana([
    sesSemana({ id: 'lun-a', dia: 0, inicioMin: 480, finMin: 540 }),
    sesSemana({ id: 'lun-b', dia: 0, inicioMin: 500, finMin: 560 }), // choca con lun-a
    sesSemana({ id: 'mar-a', dia: 1, inicioMin: 480, finMin: 540 }), // mismo horario, otro día — no debería chocar
  ]);
  assert.equal(cols[0].sesiones.length, 2);
  assert.notEqual(cols[0].sesiones[0].carril, cols[0].sesiones[1].carril);
  assert.equal(cols[1].sesiones.length, 1);
  assert.equal(cols[1].sesiones[0].carril, 0);
  assert.equal(cols[1].sesiones[0].totalCarriles, 1);
});

test('hayAtencion por lista de espera funciona igual que en la vista de día', () => {
  const cols = prepararColumnasDiaSemana([sesSemana({ id: 'a', dia: 2, enEspera: 1 })]);
  assert.equal(cols[2].hayAtencion, true);
});
