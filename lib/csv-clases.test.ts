import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapearClase, validarFilasClase, parsearHora, parsearDiaSemana,
  CAMPOS_CLASE, type CampoClase,
} from './csv.ts';

// ─── parsearHora ─────────────────────────────────────────────────────────────

test('parsearHora entiende los formatos que sueltan las plataformas', () => {
  assert.equal(parsearHora('09:00'), '09:00');
  assert.equal(parsearHora('9:00'), '09:00');
  assert.equal(parsearHora('9.30'), '09:30');
  assert.equal(parsearHora('19:45'), '19:45');
  assert.equal(parsearHora(' 7:05 '), '07:05');
});

test('parsearHora respeta AM/PM', () => {
  assert.equal(parsearHora('7:00 PM'), '19:00');
  assert.equal(parsearHora('7:00 AM'), '07:00');
  assert.equal(parsearHora('12:00 AM'), '00:00');
  assert.equal(parsearHora('12:30 PM'), '12:30');
});

test('parsearHora rechaza lo que no es una hora', () => {
  assert.equal(parsearHora(''), null);
  assert.equal(parsearHora(null), null);
  assert.equal(parsearHora('mañana'), null);
  assert.equal(parsearHora('25:00'), null);
  assert.equal(parsearHora('10:99'), null);
});

// ─── parsearDiaSemana ────────────────────────────────────────────────────────

test('parsearDiaSemana usa la convención de Postgres (0=domingo)', () => {
  assert.equal(parsearDiaSemana('domingo'), 0);
  assert.equal(parsearDiaSemana('lunes'), 1);
  assert.equal(parsearDiaSemana('sábado'), 6);
});

test('parsearDiaSemana acepta inglés, abreviaturas y acentos', () => {
  assert.equal(parsearDiaSemana('Monday'), 1);
  assert.equal(parsearDiaSemana('MIÉRCOLES'), 3);
  assert.equal(parsearDiaSemana('mie'), 3);
  assert.equal(parsearDiaSemana('Vie.'), 5);
  assert.equal(parsearDiaSemana('Thu'), 4);
});

test('parsearDiaSemana encuentra el día dentro de un texto', () => {
  assert.equal(parsearDiaSemana('todos los lunes'), 1);
  assert.equal(parsearDiaSemana('every friday'), 5);
});

test('parsearDiaSemana devuelve null si no hay día', () => {
  assert.equal(parsearDiaSemana('quincenal'), null);
  assert.equal(parsearDiaSemana(''), null);
  assert.equal(parsearDiaSemana(null), null);
});

// ─── auto-mapeo ──────────────────────────────────────────────────────────────

test('autoMapearClase reconoce cabeceras en español', () => {
  const m = autoMapearClase(['Clase', 'Día de la semana', 'Hora inicio', 'Hora fin', 'Instructora', 'Sala', 'Aforo']);
  assert.equal(m.clase, 0);
  assert.equal(m.dia_semana, 1);
  assert.equal(m.hora_inicio, 2);
  assert.equal(m.hora_fin, 3);
  assert.equal(m.instructor, 4);
  assert.equal(m.sala, 5);
  assert.equal(m.aforo, 6);
});

test('autoMapearClase reconoce cabeceras en inglés', () => {
  const m = autoMapearClase(['Class', 'Date', 'Start time', 'Duration', 'Teacher', 'Room', 'Capacity']);
  assert.equal(m.clase, 0);
  assert.equal(m.fecha, 1);
  assert.equal(m.hora_inicio, 2);
  assert.equal(m.duracion, 3);
  assert.equal(m.instructor, 4);
  assert.equal(m.sala, 5);
  assert.equal(m.aforo, 6);
});

test('autoMapearClase no asigna dos campos a la misma columna', () => {
  const m = autoMapearClase(['Clase', 'Hora inicio', 'Hora fin']);
  const usados = Object.values(m).filter(i => i >= 0);
  assert.equal(new Set(usados).size, usados.length, 'cada columna se usa una sola vez');
});

test('columnas ausentes quedan a -1', () => {
  const m = autoMapearClase(['Clase', 'Hora inicio', 'Duración']);
  assert.equal(m.sala, -1);
  assert.equal(m.aforo, -1);
});

// ─── validación ──────────────────────────────────────────────────────────────

const MAPEO_COMPLETO: Record<CampoClase, number> = {
  clase: 0, fecha: 1, dia_semana: 2, hora_inicio: 3, hora_fin: 4,
  duracion: 5, instructor: 6, sala: 7, aforo: 8,
};

function fila(o: Partial<Record<CampoClase, string>>): string[] {
  const f = new Array(9).fill('');
  for (const [k, v] of Object.entries(o)) f[MAPEO_COMPLETO[k as CampoClase]] = v as string;
  return f;
}

test('acepta una fila con FECHA concreta', () => {
  const r = validarFilasClase([fila({ clase: 'Pilates Mat', fecha: '22/07/2026', hora_inicio: '09:00', hora_fin: '10:00' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.fecha, '2026-07-22');
  assert.equal(r[0].datos.horaInicio, '09:00');
});

test('acepta una fila RECURRENTE por día de la semana', () => {
  const r = validarFilasClase([fila({ clase: 'Reformer', dia_semana: 'Lunes', hora_inicio: '19:00', duracion: '50' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.diaSemana, 1);
  assert.equal(r[0].datos.duracion, 50);
  assert.equal(r[0].datos.fecha, null);
});

test('rechaza si no hay ni fecha ni día de la semana', () => {
  const r = validarFilasClase([fila({ clase: 'Pilates', hora_inicio: '09:00', hora_fin: '10:00' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo!, /fecha o el día/i);
});

test('rechaza si no hay hora de fin ni duración (no se puede saber cuánto dura)', () => {
  const r = validarFilasClase([fila({ clase: 'Pilates', dia_semana: 'martes', hora_inicio: '09:00' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo!, /hora de fin o la duración/i);
});

test('rechaza si falta el nombre de la clase o la hora', () => {
  const sinClase = validarFilasClase([fila({ dia_semana: 'lunes', hora_inicio: '09:00', duracion: '50' })], MAPEO_COMPLETO);
  assert.match(sinClase[0].motivo!, /nombre de la clase/i);
  const sinHora = validarFilasClase([fila({ clase: 'Pilates', dia_semana: 'lunes', duracion: '50' })], MAPEO_COMPLETO);
  assert.match(sinHora[0].motivo!, /hora de inicio/i);
});

test('rechaza si la hora de fin no es posterior a la de inicio', () => {
  const r = validarFilasClase([fila({ clase: 'Pilates', dia_semana: 'lunes', hora_inicio: '10:00', hora_fin: '09:00' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo!, /anterior o igual/i);
});

test('aforo y duración inválidos o negativos quedan a null, no rompen', () => {
  const r = validarFilasClase([fila({ clase: 'Pilates', dia_semana: 'lunes', hora_inicio: '09:00', hora_fin: '10:00', aforo: 'muchas', duracion: '-5' })], MAPEO_COMPLETO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.aforo, null);
  assert.equal(r[0].datos.duracion, null);
});

test('numera las filas empezando en 1 para poder señalar el error al usuario', () => {
  const r = validarFilasClase([
    fila({ clase: 'A', dia_semana: 'lunes', hora_inicio: '09:00', duracion: '50' }),
    fila({ clase: '', dia_semana: 'lunes', hora_inicio: '09:00', duracion: '50' }),
  ], MAPEO_COMPLETO);
  assert.equal(r[0].fila, 1);
  assert.equal(r[1].fila, 2);
  assert.equal(r[1].estado, 'error');
});

test('los campos obligatorios declarados son clase y hora de inicio', () => {
  const obligatorios = CAMPOS_CLASE.filter(c => c.obligatorio).map(c => c.campo);
  assert.deepEqual(obligatorios.sort(), ['clase', 'hora_inicio']);
});
