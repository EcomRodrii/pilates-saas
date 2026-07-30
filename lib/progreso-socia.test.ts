import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenProgreso, barrasPorSemana, claseFavorita } from './progreso-socia.ts';
import type { Reserva, Sesion, TipoClase, Instructor } from './types';

let n = 0;
const ses = (id: string, inicio: string, minutos: number, tipoClaseId = 'tc-1', instructorId = 'ins-1'): Sesion => ({
  id, studioId: 'st', tipoClaseId, salaId: 'sala', instructorId,
  inicio, fin: new Date(new Date(inicio).getTime() + minutos * 60000).toISOString(),
  aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null,
});
const res = (sesionId: string, estado: Reserva['estado'] = 'ASISTIDA'): Reserva => ({
  id: `r${++n}`, studioId: 'st', sesionId, socioId: 'soc', estado,
  spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: '',
});
const tipo = (id: string, nombre: string) => ({ id, nombre } as TipoClase);
const instr = (id: string, nombre: string) => ({ id, nombre } as Instructor);

test('cuenta las clases a las que fue y las horas que pasó dentro', () => {
  const sesiones = [ses('s1', '2026-07-01T09:00:00', 60), ses('s2', '2026-07-02T09:00:00', 50), ses('s3', '2026-07-03T09:00:00', 60)];
  const r = resumenProgreso([res('s1'), res('s2'), res('s3', 'CANCELADA')], sesiones);
  assert.equal(r.clases, 2, 'la cancelada no cuenta');
  assert.equal(r.horas, 2, '60 + 50 = 110 min ≈ 2 h');
});

// Reservar no es ir: solo ASISTIDA suma. Contar las confirmadas convertiría el
// «progreso» en una lista de intenciones.
test('una reserva confirmada pero sin asistir no suma', () => {
  const sesiones = [ses('s1', '2026-07-01T09:00:00', 60)];
  assert.equal(resumenProgreso([res('s1', 'CONFIRMADA')], sesiones).clases, 0);
});

test('sin nada, todo a cero y sin reventar', () => {
  assert.deepEqual(resumenProgreso([], []), { clases: 0, horas: 0 });
  assert.equal(resumenProgreso([res('fantasma')], []).clases, 0, 'reserva de una sesión que ya no existe');
});

// ── El gráfico ───────────────────────────────────────────────────────────────

const AHORA = new Date('2026-07-29T12:00:00'); // miércoles

test('siempre devuelve doce barras, aunque no haya ido nunca', () => {
  const b = barrasPorSemana([], [], AHORA);
  assert.equal(b.length, 12);
  assert.ok(b.every(x => x.clases === 0 && x.altura === 0));
});

test('la última barra es la semana en curso y va en orden', () => {
  const b = barrasPorSemana([], [], AHORA);
  assert.equal(b[11].semana, '2026-07-27', 'lunes de esta semana');
  assert.equal(b[0].semana, '2026-05-11', 'once semanas antes');
  assert.ok(b[11].esteMes);
});

test('la altura es relativa a la mejor semana', () => {
  const sesiones = [
    ses('a', '2026-07-27T09:00:00', 60), ses('b', '2026-07-28T09:00:00', 60),
    ses('c', '2026-07-20T09:00:00', 60),
  ];
  const b = barrasPorSemana([res('a'), res('b'), res('c')], sesiones, AHORA);
  assert.equal(b[11].clases, 2);
  assert.equal(b[11].altura, 1, 'la mejor semana llena el gráfico');
  assert.equal(b[10].altura, 0.5, 'la mitad de la mejor');
});

// Repetir «JUL» en cuatro barras seguidas convierte el pie en ruido.
test('la etiqueta de mes solo sale en la primera semana de cada mes', () => {
  const meses = barrasPorSemana([], [], AHORA).filter(b => b.mes).map(b => b.mes);
  assert.deepEqual(meses, ['MAY', 'JUN', 'JUL']);
});

// ── La clase favorita ────────────────────────────────────────────────────────

const TIPOS = [tipo('tc-1', 'Reformer Flow'), tipo('tc-2', 'Pilates Mat')];
const INSTR = [instr('ins-1', 'Ana Ferrer'), instr('ins-2', 'María Soler')];

test('gana el tipo al que más ha ido, y dice con quién si siempre fue la misma', () => {
  const sesiones = [
    ses('a', '2026-07-01T09:00:00', 60, 'tc-1', 'ins-1'),
    ses('b', '2026-07-02T09:00:00', 60, 'tc-1', 'ins-1'),
    ses('c', '2026-07-03T09:00:00', 60, 'tc-1', 'ins-1'),
    ses('d', '2026-07-04T09:00:00', 60, 'tc-2', 'ins-2'),
  ];
  const f = claseFavorita([res('a'), res('b'), res('c'), res('d')], sesiones, TIPOS, INSTR)!;
  assert.equal(f.nombre, 'Reformer Flow');
  assert.equal(f.veces, 3);
  assert.equal(f.total, 4);
  assert.equal(f.instructoraFija, 'Ana Ferrer');
});

test('si ha cambiado de instructora, no se dice ninguna', () => {
  const sesiones = [
    ses('a', '2026-07-01T09:00:00', 60, 'tc-1', 'ins-1'),
    ses('b', '2026-07-02T09:00:00', 60, 'tc-1', 'ins-2'),
    ses('c', '2026-07-03T09:00:00', 60, 'tc-1', 'ins-1'),
  ];
  assert.equal(claseFavorita([res('a'), res('b'), res('c')], sesiones, TIPOS, INSTR)!.instructoraFija, null);
});

// «Tu clase favorita» con dos clases no es un dato, es una casualidad.
test('con menos de tres clases no hay favorita', () => {
  const sesiones = [ses('a', '2026-07-01T09:00:00', 60), ses('b', '2026-07-02T09:00:00', 60)];
  assert.equal(claseFavorita([res('a'), res('b')], sesiones, TIPOS, INSTR), null);
});

test('un empate arriba tampoco tiene favorita', () => {
  const sesiones = [
    ses('a', '2026-07-01T09:00:00', 60, 'tc-1'), ses('b', '2026-07-02T09:00:00', 60, 'tc-1'),
    ses('c', '2026-07-03T09:00:00', 60, 'tc-2'), ses('d', '2026-07-04T09:00:00', 60, 'tc-2'),
  ];
  assert.equal(claseFavorita([res('a'), res('b'), res('c'), res('d')], sesiones, TIPOS, INSTR), null);
});
