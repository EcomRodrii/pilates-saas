import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LecturaHorarioSchema, avisosLimpios, filaValida, filasParaImportar, filasRevisables, instructoraNueva, problemasDeFila, proximoLunes,
  type ClaseLeida, type LecturaHorario,
} from './mapeo.ts';

const clase = (o: Partial<ClaseLeida>): ClaseLeida => ({
  dia: 'lunes', inicio: '09:00', fin: '09:50', clase: 'Reformer', instructora: 'Ana', sala: 'Sala 1', aforo: 8, seguridad: 'alta', ...o,
});
const lectura = (clases: ClaseLeida[], resultado: LecturaHorario['resultado'] = 'HORARIO'): LecturaHorario => ({ resultado, clases, avisos: [] });

test('el esquema acepta lo que devuelve el modelo y rechaza lo que no es', () => {
  assert.equal(LecturaHorarioSchema.safeParse(lectura([clase({})])).success, true);
  assert.equal(LecturaHorarioSchema.safeParse({ resultado: 'HORARIO', clases: [{ ...clase({}), dia: 'lunes-ish' }], avisos: [] }).success, false);
  assert.equal(LecturaHorarioSchema.safeParse({ resultado: 'OTRA', clases: [], avisos: [] }).success, false);
});

test('días de la semana al formato del importador (domingo = 0) y ordenados de lunes a domingo', () => {
  const { filas } = filasRevisables(lectura([
    clase({ dia: 'domingo', inicio: '10:00', fin: '11:00' }),
    clase({ dia: 'miercoles', inicio: '19:00', fin: '19:50' }),
    clase({ dia: 'lunes', inicio: '18:00', fin: '18:50' }),
    clase({ dia: 'lunes', inicio: '09:00', fin: '09:50' }),
  ]));
  assert.deepEqual(filas.map((f) => `${f.dia} ${f.inicio}`), ['lunes 09:00', 'lunes 18:00', 'miercoles 19:00', 'domingo 10:00']);
  assert.deepEqual(filasParaImportar(filas).map((f) => f.diaSemana), [1, 1, 3, 0]);
});

test('horas en otros formatos se normalizan; un final que no va después del inicio se descarta', () => {
  const { filas, descartadas } = filasRevisables(lectura([
    clase({ inicio: '9h', fin: '9.50' }),
    clase({ inicio: '7:00 pm', fin: '7:50 pm' }),
    clase({ inicio: '10:00', fin: '09:00' }),
    clase({ inicio: 'mañana', fin: null }),
    clase({ clase: '   ' }),
  ]));
  assert.deepEqual(filas.map((f) => [f.inicio, f.fin]), [['09:00', '09:50'], ['19:00', '19:50']]);
  assert.equal(descartadas, 3);
});

test('aforo raro → vacío (manda el de la sala); los dudosos se marcan', () => {
  const { filas } = filasRevisables(lectura([clase({ aforo: 0 }), clase({ dia: 'martes', aforo: 12.5, seguridad: 'baja' }), clase({ dia: 'jueves', aforo: 999 })]));
  assert.deepEqual(filas.map((f) => f.aforo), [null, null, null]);
  assert.deepEqual(filas.map((f) => f.dudosa), [false, true, false]);
});

test('lo que no es un horario no da filas', () => {
  assert.deepEqual(filasRevisables(lectura([clase({})], 'NO_ES_HORARIO')).filas, []);
  assert.deepEqual(filasRevisables(lectura([clase({})], 'ILEGIBLE')).filas, []);
});

test('al importador van clases SEMANALES, sin fecha: la primera semana la pone el servidor', () => {
  const [f] = filasParaImportar(filasRevisables(lectura([clase({ instructora: '  Ana  García ' })])).filas);
  assert.deepEqual(f, {
    clase: 'Reformer', fecha: null, diaSemana: 1, horaInicio: '09:00', horaFin: '09:50',
    duracion: null, instructor: 'Ana García', sala: 'Sala 1', aforo: 8,
  });
});

test('una fila editada a mano que ya no vale no se importa', () => {
  const [ok] = filasRevisables(lectura([clase({})])).filas;
  assert.equal(filaValida(ok), true);
  assert.equal(filaValida({ ...ok, inicio: '25:00' }), false);
  assert.equal(filaValida({ ...ok, fin: '08:00' }), false);
  assert.equal(filaValida({ ...ok, clase: '' }), false);
  assert.equal(filasParaImportar([ok, { ...ok, clase: '' }]).length, 1);
});

test('el próximo lunes: nunca hoy ni antes (también si hoy es lunes o domingo)', () => {
  assert.equal(proximoLunes('2026-10-13'), '2026-10-19'); // martes
  assert.equal(proximoLunes('2026-10-19'), '2026-10-26'); // lunes → el siguiente
  assert.equal(proximoLunes('2026-10-18'), '2026-10-19'); // domingo → mañana
  assert.equal(proximoLunes('2026-12-29'), '2027-01-04'); // cruza de año
  for (let i = 0; i < 14; i++) {
    const hoy = `2026-10-${String(10 + i).padStart(2, '0')}`;
    assert.ok(proximoLunes(hoy) > hoy);
  }
});

test('con TZ=UTC, lo mismo', () => {
  const antes = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    assert.equal(proximoLunes('2026-10-25'), '2026-10-26'); // domingo del cambio de hora
  } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
});

test('instructora nueva: con la regla del importador (nombre igual o nombre de pila de una sola)', () => {
  const equipo = ['Ana García', 'Lucía Pérez', 'Lucía Gómez'];
  assert.equal(instructoraNueva('ana garcía', equipo), false, 'igual, sin acentos ni mayúsculas');
  assert.equal(instructoraNueva('Ana', equipo), false, 'el nombre de pila de una sola');
  assert.equal(instructoraNueva('Lucía', equipo), true, 'dos Lucías: no se sabe cuál, se daría de alta');
  assert.equal(instructoraNueva('Marta Ruiz', equipo), true);
  assert.equal(instructoraNueva('-', equipo), false, 'no crea a nadie');
  assert.equal(instructoraNueva(null, equipo), false);
});

test('los avisos del modelo no llevan enlaces ni teléfonos', () => {
  assert.deepEqual(avisosLimpios(['La columna del sábado está cortada', 'Escribe a www.ejemplo.com', 'Llama al 600123456', 'https://x.invalid']), ['La columna del sábado está cortada']);
  assert.equal(avisosLimpios(Array.from({ length: 9 }, (_, i) => `aviso ${i}`)).length, 5);
});

test('una fila repetida (misma clase, día y hora) se crea una vez', () => {
  const { filas } = filasRevisables(lectura([clase({}), clase({ clase: ' reformer ' }), clase({ dia: 'martes' })]));
  assert.equal(filas.length, 3);
  assert.deepEqual(filasParaImportar(filas).map((f) => f.diaSemana), [1, 2]);
});

test('una hora que el modelo no da en HH:MM se traduce pero la fila sale dudosa', () => {
  const { filas } = filasRevisables(lectura([clase({ inicio: '7:00pm', fin: '7:50pm' }), clase({ dia: 'martes' })]));
  assert.deepEqual(filas.map((f) => [f.inicio, f.dudosa]), [['19:00', true], ['09:00', false]]);
});

test('qué campo falla, uno a uno (para marcarlo en la tabla)', () => {
  const [ok] = filasRevisables(lectura([clase({})])).filas;
  assert.deepEqual(problemasDeFila(ok), []);
  assert.deepEqual(problemasDeFila({ ...ok, fin: '08:00' }), ['fin']);
  assert.deepEqual(problemasDeFila({ ...ok, clase: ' ', aforo: 201 }), ['clase', 'aforo']);
  assert.equal(filaValida({ ...ok, aforo: 0 }), false, 'un aforo fuera de rango no se crea en silencio con otro');
});

