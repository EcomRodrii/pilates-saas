import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapearReserva, validarFilasReserva, normalizarEstadoReserva,
  type CampoReserva,
} from './csv.ts';

// ─── normalización de estado ─────────────────────────────────────────────────

test('sin estado se asume CONFIRMADA (la reserva existía en el programa anterior)', () => {
  assert.equal(normalizarEstadoReserva(''), 'CONFIRMADA');
  assert.equal(normalizarEstadoReserva(null), 'CONFIRMADA');
  assert.equal(normalizarEstadoReserva('   '), 'CONFIRMADA');
});

test('reconoce los plantones — es lo que alimenta el riesgo de no-show', () => {
  for (const s of ['no show', 'No-Show', 'NO ASISTIÓ', 'no asistio', 'faltó', 'ausente', 'missed']) {
    assert.equal(normalizarEstadoReserva(s), 'NO_ASISTIO', `falló con "${s}"`);
  }
});

test('reconoce asistencia, cancelación y lista de espera', () => {
  for (const s of ['asistió', 'Asistida', 'attended', 'checked in', 'presente', 'completada']) {
    assert.equal(normalizarEstadoReserva(s), 'ASISTIDA', `falló con "${s}"`);
  }
  for (const s of ['cancelada', 'Cancelled', 'anulada', 'baja']) {
    assert.equal(normalizarEstadoReserva(s), 'CANCELADA', `falló con "${s}"`);
  }
  for (const s of ['lista de espera', 'waitlist', 'wait list', 'en espera']) {
    assert.equal(normalizarEstadoReserva(s), 'LISTA_ESPERA', `falló con "${s}"`);
  }
});

test('un estado desconocido no rompe: cae a CONFIRMADA', () => {
  assert.equal(normalizarEstadoReserva('pepito'), 'CONFIRMADA');
});

test('cancelada gana a asistida cuando el texto es ambiguo', () => {
  // "cancelada tras asistir" no debe contar como asistencia.
  assert.equal(normalizarEstadoReserva('cancelada tras asistir'), 'CANCELADA');
});

// ─── auto-mapeo ──────────────────────────────────────────────────────────────

test('autoMapearReserva reconoce cabeceras en español e inglés', () => {
  const es = autoMapearReserva(['Email', 'Clase', 'Fecha', 'Hora inicio', 'Estado']);
  assert.deepEqual([es.email, es.clase, es.fecha, es.hora_inicio, es.estado], [0, 1, 2, 3, 4]);
  const en = autoMapearReserva(['Mail', 'Class', 'Date', 'Start time', 'Status']);
  assert.deepEqual([en.email, en.clase, en.fecha, en.hora_inicio, en.estado], [0, 1, 2, 3, 4]);
});

test('columnas ausentes quedan a -1 y no se repiten columnas', () => {
  const m = autoMapearReserva(['Email', 'Clase', 'Fecha', 'Hora']);
  assert.equal(m.estado, -1);
  const usados = Object.values(m).filter(i => i >= 0);
  assert.equal(new Set(usados).size, usados.length);
});

// ─── validación ──────────────────────────────────────────────────────────────

const MAPEO: Record<CampoReserva, number> = { email: 0, clase: 1, fecha: 2, hora_inicio: 3, estado: 4 };
const fila = (email: string, clase: string, fecha: string, hora: string, estado = '') =>
  [email, clase, fecha, hora, estado];

test('acepta una fila completa y normaliza email, fecha y hora', () => {
  const r = validarFilasReserva([fila('  ANA@Ejemplo.com ', 'Pilates Mat', '22/07/2026', '9:00', 'asistió')], MAPEO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.email, 'ana@ejemplo.com');
  assert.equal(r[0].datos.fecha, '2026-07-22');
  assert.equal(r[0].datos.horaInicio, '09:00');
  assert.equal(r[0].datos.estado, 'ASISTIDA');
});

test('sin columna de estado, la reserva se da por confirmada', () => {
  const r = validarFilasReserva([fila('ana@ejemplo.com', 'Pilates', '22/07/2026', '09:00')], MAPEO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.estado, 'CONFIRMADA');
});

test('rechaza email ausente o inválido', () => {
  const sin = validarFilasReserva([fila('', 'Pilates', '22/07/2026', '09:00')], MAPEO);
  assert.match(sin[0].motivo!, /email/i);
  const malo = validarFilasReserva([fila('no-es-email', 'Pilates', '22/07/2026', '09:00')], MAPEO);
  assert.equal(malo[0].estado, 'error');
  assert.match(malo[0].motivo!, /no es válido/i);
});

test('rechaza si falta clase, fecha u hora (sin eso no se puede localizar la sesión)', () => {
  assert.match(validarFilasReserva([fila('a@b.com', '', '22/07/2026', '09:00')], MAPEO)[0].motivo!, /clase/i);
  assert.match(validarFilasReserva([fila('a@b.com', 'Pilates', '', '09:00')], MAPEO)[0].motivo!, /fecha/i);
  assert.match(validarFilasReserva([fila('a@b.com', 'Pilates', '22/07/2026', '')], MAPEO)[0].motivo!, /hora/i);
});

test('numera las filas desde 1 para poder señalar el error', () => {
  const r = validarFilasReserva([
    fila('a@b.com', 'Pilates', '22/07/2026', '09:00'),
    fila('', 'Pilates', '22/07/2026', '09:00'),
  ], MAPEO);
  assert.equal(r[0].fila, 1);
  assert.equal(r[1].fila, 2);
  assert.equal(r[1].estado, 'error');
});
