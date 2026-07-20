import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapearCita, validarFilasCita, normalizarTipoCita, normalizarEstadoCita,
  type CampoCita,
} from './csv.ts';

// ─── tipo (el CHECK de la BD solo admite 4 valores) ──────────────────────────

test('deduce el tipo del texto libre del servicio', () => {
  assert.equal(normalizarTipoCita('Fisioterapia'), 'FISIOTERAPIA');
  assert.equal(normalizarTipoCita('sesión de fisio'), 'FISIOTERAPIA');
  assert.equal(normalizarTipoCita('Clase online'), 'ONLINE');
  assert.equal(normalizarTipoCita('por Zoom'), 'ONLINE');
  assert.equal(normalizarTipoCita('Evaluación inicial'), 'EVALUACION');
  assert.equal(normalizarTipoCita('valoración postural'), 'EVALUACION');
  assert.equal(normalizarTipoCita('Clase privada'), 'PRIVADA');
});

test('sin servicio o con texto desconocido cae a PRIVADA (la cita más común)', () => {
  assert.equal(normalizarTipoCita(''), 'PRIVADA');
  assert.equal(normalizarTipoCita(null), 'PRIVADA');
  assert.equal(normalizarTipoCita('lo que sea'), 'PRIVADA');
});

// ─── estado ──────────────────────────────────────────────────────────────────

test('sin estado se asume CONFIRMADA (la cita existía)', () => {
  assert.equal(normalizarEstadoCita(''), 'CONFIRMADA');
  assert.equal(normalizarEstadoCita(null), 'CONFIRMADA');
});

test('reconoce completada, cancelada, plantón y pendiente', () => {
  for (const s of ['completada', 'realizada', 'hecha', 'done', 'asistió']) {
    assert.equal(normalizarEstadoCita(s), 'COMPLETADA', `falló con "${s}"`);
  }
  for (const s of ['cancelada', 'Cancelled', 'anulada']) {
    assert.equal(normalizarEstadoCita(s), 'CANCELADA', `falló con "${s}"`);
  }
  for (const s of ['no show', 'NO ASISTIÓ', 'faltó', 'missed']) {
    assert.equal(normalizarEstadoCita(s), 'NO_ASISTIO', `falló con "${s}"`);
  }
  for (const s of ['pendiente', 'por confirmar', 'pending']) {
    assert.equal(normalizarEstadoCita(s), 'PENDIENTE', `falló con "${s}"`);
  }
});

test('cancelada gana a completada en textos ambiguos', () => {
  assert.equal(normalizarEstadoCita('cancelada, ya realizada antes'), 'CANCELADA');
});

// ─── auto-mapeo ──────────────────────────────────────────────────────────────

test('autoMapearCita reconoce cabeceras en español e inglés', () => {
  const es = autoMapearCita(['Email', 'Servicio', 'Fecha', 'Hora', 'Duración', 'Instructora', 'Estado', 'Precio']);
  assert.equal(es.email, 0);
  assert.equal(es.servicio, 1);
  assert.equal(es.fecha, 2);
  assert.equal(es.hora_inicio, 3);
  assert.equal(es.duracion, 4);
  assert.equal(es.instructor, 5);
  assert.equal(es.estado, 6);
  assert.equal(es.precio, 7);
});

test('no repite columnas entre campos', () => {
  const m = autoMapearCita(['Email', 'Fecha', 'Hora inicio']);
  const usados = Object.values(m).filter(i => i >= 0);
  assert.equal(new Set(usados).size, usados.length);
});

// ─── validación ──────────────────────────────────────────────────────────────

const MAPEO: Record<CampoCita, number> = {
  email: 0, servicio: 1, fecha: 2, hora_inicio: 3, duracion: 4, instructor: 5, estado: 6, precio: 7,
};
const fila = (o: Partial<Record<CampoCita, string>>) => {
  const f = new Array(8).fill('');
  for (const [k, v] of Object.entries(o)) f[MAPEO[k as CampoCita]] = v as string;
  return f;
};

test('acepta una fila completa y normaliza todo', () => {
  const r = validarFilasCita([fila({
    email: ' ANA@Ejemplo.com ', servicio: 'Fisioterapia', fecha: '22/07/2026',
    hora_inicio: '9:30', duracion: '45', instructor: 'María', estado: 'realizada', precio: '35,50 €',
  })], MAPEO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.email, 'ana@ejemplo.com');
  assert.equal(r[0].datos.tipo, 'FISIOTERAPIA');
  assert.equal(r[0].datos.fecha, '2026-07-22');
  assert.equal(r[0].datos.horaInicio, '09:30');
  assert.equal(r[0].datos.duracion, 45);
  assert.equal(r[0].datos.estado, 'COMPLETADA');
  assert.equal(r[0].datos.precio, 35.5, 'precio con € y coma decimal');
});

test('lo mínimo es email, fecha y hora — el resto es opcional', () => {
  const r = validarFilasCita([fila({ email: 'a@b.com', fecha: '01/08/2026', hora_inicio: '10:00' })], MAPEO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.tipo, 'PRIVADA');
  assert.equal(r[0].datos.estado, 'CONFIRMADA');
  assert.equal(r[0].datos.duracion, null);
  assert.equal(r[0].datos.instructor, null);
});

test('rechaza email, fecha u hora ausentes o inválidos', () => {
  assert.match(validarFilasCita([fila({ fecha: '01/08/2026', hora_inicio: '10:00' })], MAPEO)[0].motivo!, /email/i);
  assert.match(validarFilasCita([fila({ email: 'malo', fecha: '01/08/2026', hora_inicio: '10:00' })], MAPEO)[0].motivo!, /no es válido/i);
  assert.match(validarFilasCita([fila({ email: 'a@b.com', hora_inicio: '10:00' })], MAPEO)[0].motivo!, /fecha/i);
  assert.match(validarFilasCita([fila({ email: 'a@b.com', fecha: '01/08/2026' })], MAPEO)[0].motivo!, /hora/i);
});

test('duración y precio inválidos o negativos quedan a null, no rompen', () => {
  const r = validarFilasCita([fila({
    email: 'a@b.com', fecha: '01/08/2026', hora_inicio: '10:00', duracion: 'larga', precio: '-10',
  })], MAPEO);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.duracion, null);
  assert.equal(r[0].datos.precio, null, 'un precio negativo violaría el CHECK de la BD');
});

test('numera las filas desde 1', () => {
  const r = validarFilasCita([
    fila({ email: 'a@b.com', fecha: '01/08/2026', hora_inicio: '10:00' }),
    fila({ email: '', fecha: '01/08/2026', hora_inicio: '10:00' }),
  ], MAPEO);
  assert.equal(r[0].fila, 1);
  assert.equal(r[1].fila, 2);
  assert.equal(r[1].estado, 'error');
});
