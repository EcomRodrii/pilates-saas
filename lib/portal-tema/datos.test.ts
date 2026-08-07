import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bonoDe, clasesDeLaSemana, construirDatosPortal, fechaLarga, filtrosDe,
  horaLocal, inicialDe, planesDe, semanaDe, sociaDe,
} from './datos.ts';
import type { Instructor, PlanTarifa, Reserva, Sala, Sesion, Socio, Suscripcion, TipoClase } from '../types.ts';

// ── Fixtures mínimos. Solo lo que el adaptador mira. ────────────────────────

const tipo = (id: string, nombre: string, extra: Partial<TipoClase> = {}): TipoClase => ({
  id, studioId: 's1', nombre, color: '#000', duracionMinutos: 50, descripcion: null,
  nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null, reservaExigirPlan: null,
  reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, permiteListaEspera: null,
  requiereAprobacion: null, listaEsperaPlazoAceptacionMinutos: null, minimoAsistentesPorClase: null,
  penalizacionImporteEur: null, ...extra,
});

const sala = (id: string, nombre: string): Sala => ({ id, studioId: 's1', nombre, capacidad: 10, color: '#000' });

const instructor = (id: string, nombre: string): Instructor => ({
  id, studioId: 's1', nombre, email: null, telefono: null, color: '#000', activo: true,
  rol: 'INSTRUCTOR', authUserId: null,
});

const sesion = (id: string, inicio: string, fin: string, extra: Partial<Sesion> = {}): Sesion => ({
  id, studioId: 's1', tipoClaseId: 't1', salaId: 'sa1', instructorId: 'i1',
  inicio, fin, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, ...extra,
});

const reserva = (id: string, sesionId: string, estado: Reserva['estado']): Reserva => ({
  id, studioId: 's1', sesionId, socioId: 'so1', estado, spotId: null, posicionEspera: null,
  ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-09-01T00:00:00.000Z',
});

const plan = (id: string, nombre: string, extra: Partial<PlanTarifa> = {}): PlanTarifa => ({
  id, studioId: 's1', nombre, descripcion: null, precio: 100, tipo: 'BONO', sesiones: 10, activo: true, ...extra,
});

const suscripcion = (id: string, planId: string, extra: Partial<Suscripcion> = {}): Suscripcion => ({
  id, studioId: 's1', socioId: 'so1', planId, estado: 'ACTIVA',
  fechaInicio: '2026-09-01T00:00:00.000Z', fechaFin: null, sesionesRestantes: 5,
  stripeSubscriptionId: null, ...extra,
});

const BASE = {
  sesiones: [], reservas: [], tiposClase: [], salas: [], instructores: [],
  socio: null, suscripciones: [], planes: [],
};

// ── La semana ───────────────────────────────────────────────────────────────

test('semanaDe: siete días de lunes a domingo, con el día del mes', () => {
  // Jueves 3 de septiembre de 2026.
  const semana = semanaDe(new Date('2026-09-03T10:00:00.000Z'));
  assert.equal(semana.length, 7);
  assert.deepEqual(semana.map((d) => d.label), ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']);
  assert.deepEqual(semana.map((d) => d.num), [31, 1, 2, 3, 4, 5, 6]);
});

test('semanaDe: un lunes se queda en su propia semana, no salta a la anterior', () => {
  const semana = semanaDe(new Date('2026-09-07T08:00:00.000Z')); // lunes
  assert.equal(semana[0].num, 7);
  assert.equal(semana[6].num, 13);
});

// ⚠️ El bug que ya se comió la migración 0105: una clase de madrugada cae el
// día ANTERIOR en UTC. Si la semana se calculara en UTC, un domingo a las 00:30
// de Madrid se contaría como sábado y el horario lo enseñaría en el día que no
// es.
test('semanaDe: la medianoche de Madrid no se va al día anterior', () => {
  // 2026-09-07T00:30 en Madrid = 2026-09-06T22:30Z (domingo en UTC, lunes en Madrid).
  const semana = semanaDe(new Date('2026-09-06T22:30:00.000Z'));
  assert.equal(semana[0].num, 7, 'la semana empieza el lunes 7, no el 31 de agosto');
});

test('semanaDe: el cambio de hora de octubre no descuadra la semana', () => {
  // El domingo 25/10/2026 se atrasa el reloj en España.
  const semana = semanaDe(new Date('2026-10-28T09:00:00.000Z'));
  assert.deepEqual(semana.map((d) => d.num), [26, 27, 28, 29, 30, 31, 1]);
});

// ── Las clases ──────────────────────────────────────────────────────────────

test('clasesDeLaSemana: resuelve tipo, sala e instructora, y la hora es de Madrid', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T16:50:00.000Z')],
    tiposClase: [tipo('t1', 'Reformer', { nivel: 'MEDIO', descripcion: 'Fuerza y control' })],
    salas: [sala('sa1', 'Sala 2')],
    instructores: [instructor('i1', 'Marta Gómez')],
  });
  assert.equal(clases.length, 1);
  assert.deepEqual(clases[0], {
    id: 'x1', name: 'Reformer', type: 't1', day: 3,
    time: '18:00', end: '18:50', duration: '50 min',
    room: 'Sala 2', level: 'MEDIO', teacher: 'Marta Gómez', initial: 'M',
    seats: 10, description: 'Fuerza y control',
  });
});

test('clasesDeLaSemana: fuera de la semana, canceladas y orden', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [
      sesion('tarde', '2026-09-04T18:00:00.000Z', '2026-09-04T19:00:00.000Z'),
      sesion('pronto', '2026-09-04T08:00:00.000Z', '2026-09-04T09:00:00.000Z'),
      sesion('cancelada', '2026-09-04T10:00:00.000Z', '2026-09-04T11:00:00.000Z', { cancelada: true }),
      sesion('otra-semana', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z'),
    ],
    tiposClase: [tipo('t1', 'Reformer')],
  });
  assert.deepEqual(clases.map((c) => c.id), ['pronto', 'tarde']);
});

// El aforo lo decide `plazasOcupadas`. La lista de espera y las pendientes de
// aprobación NO ocupan; `ASISTIDA` sí — si no, una clase pasada aparecería con
// plazas libres que no existen.
test('clasesDeLaSemana: plazas libres = aforo menos confirmadas y asistidas', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z', { aforoMaximo: 5 })],
    tiposClase: [tipo('t1', 'Reformer')],
    reservas: [
      reserva('r1', 'x1', 'CONFIRMADA'),
      reserva('r2', 'x1', 'ASISTIDA'),
      reserva('r3', 'x1', 'LISTA_ESPERA'),
      reserva('r4', 'x1', 'PENDIENTE_APROBACION'),
      reserva('r5', 'x1', 'CANCELADA'),
      reserva('r6', 'otra', 'CONFIRMADA'),
    ],
  });
  assert.equal(clases[0].seats, 3);
});

test('clasesDeLaSemana: nunca devuelve plazas negativas si hay sobreaforo', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z', { aforoMaximo: 1 })],
    tiposClase: [tipo('t1', 'Reformer')],
    reservas: [reserva('r1', 'x1', 'CONFIRMADA'), reserva('r2', 'x1', 'CONFIRMADA')],
  });
  assert.equal(clases[0].seats, 0);
});

test('clasesDeLaSemana: sin tipo, sala ni instructora no revienta', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z')],
  });
  assert.equal(clases[0].name, 'Clase');
  assert.equal(clases[0].room, '');
  assert.equal(clases[0].teacher, '');
  assert.equal(clases[0].initial, '');
});

// ── Filtros ─────────────────────────────────────────────────────────────────

test('filtrosDe: solo los tipos que aparecen esta semana', () => {
  const tipos = [tipo('t1', 'Reformer'), tipo('t2', 'Suelo'), tipo('t3', 'Prenatal')];
  const clases = [{ type: 't1' }, { type: 't3' }] as Parameters<typeof filtrosDe>[0];
  assert.deepEqual(filtrosDe(clases, tipos), [
    { key: 'todas', label: 'Todas' },
    { key: 't1', label: 'Reformer' },
    { key: 't3', label: 'Prenatal' },
  ]);
});

test('filtrosDe: sin clases, solo queda "Todas"', () => {
  assert.deepEqual(filtrosDe([], [tipo('t1', 'Reformer')]), [{ key: 'todas', label: 'Todas' }]);
});

// ── Planes y bono ───────────────────────────────────────────────────────────

test('planesDe: descarta los inactivos y el ilimitado queda por encima', () => {
  const salida = planesDe([
    plan('p1', 'Bono 10'),
    plan('p2', 'Retirado', { activo: false }),
    plan('p3', 'Mensual', { tipo: 'MENSUAL', sesiones: null }),
  ]);
  assert.deepEqual(salida.map((p) => p.key), ['p1', 'p3']);
  assert.ok(salida[1].classes > salida[0].classes);
});

test('bonoDe: elige el que menos sesiones le quedan', () => {
  const bono = bonoDe(
    [suscripcion('s1', 'p1', { sesionesRestantes: 8 }), suscripcion('s2', 'p2', { sesionesRestantes: 2 })],
    [plan('p1', 'Bono 10'), plan('p2', 'Bono 5', { sesiones: 5 })],
  );
  assert.equal(bono.name, 'Bono 5');
  assert.equal(bono.total, 5);
});

test('bonoDe: ignora las no activas y las de sesiones ilimitadas', () => {
  assert.deepEqual(
    bonoDe(
      [
        suscripcion('s1', 'p1', { estado: 'CANCELADA', sesionesRestantes: 1 }),
        suscripcion('s2', 'p2', { sesionesRestantes: null }),
      ],
      [plan('p1', 'Bono 10'), plan('p2', 'Mensual', { sesiones: null })],
    ),
    { name: '', total: 0, expires: '' },
  );
});

test('bonoDe: la caducidad sale formateada en largo, no en ISO', () => {
  const bono = bonoDe(
    [suscripcion('s1', 'p1', { fechaFin: '2026-09-30T21:59:59.000Z' })],
    [plan('p1', 'Bono 10')],
  );
  assert.equal(bono.expires, '30 de septiembre');
});

// ── Socia ───────────────────────────────────────────────────────────────────

test('sociaDe: nombre completo, nombre corto e inicial', () => {
  const socio = { nombre: 'Laura', apellidos: 'Ortega' } as Socio;
  assert.deepEqual(sociaDe(socio), { name: 'Laura Ortega', short: 'Laura', initial: 'L' });
});

test('sociaDe: sin socia (portal sin sesión) devuelve vacíos, no "undefined"', () => {
  assert.deepEqual(sociaDe(null), { name: '', short: '', initial: '' });
});

// ── Piezas sueltas ──────────────────────────────────────────────────────────

test('horaLocal: hora de pared de Madrid, en 24h', () => {
  assert.equal(horaLocal('2026-09-03T16:00:00.000Z'), '18:00'); // verano, +02:00
  assert.equal(horaLocal('2026-12-03T16:00:00.000Z'), '17:00'); // invierno, +01:00
});

test('fechaLarga: vacía si no hay fecha', () => {
  assert.equal(fechaLarga(null), '');
  assert.equal(fechaLarga(undefined), '');
});

test('inicialDe: en mayúscula y sin espacios de más', () => {
  assert.equal(inicialDe('  marta '), 'M');
  assert.equal(inicialDe(''), '');
});

// ── El adaptador entero ─────────────────────────────────────────────────────

test('construirDatosPortal: un estudio vacío da datos vacíos pero válidos', () => {
  const datos = construirDatosPortal({ ...BASE, ahora: new Date('2026-09-03T10:00:00.000Z') });
  assert.deepEqual(datos.clases, []);
  assert.equal(datos.dias.length, 7);
  assert.deepEqual(datos.filtros, [{ key: 'todas', label: 'Todas' }]);
  assert.deepEqual(datos.planes, []);
  assert.deepEqual(datos.bono, { name: '', total: 0, expires: '' });
  assert.deepEqual(datos.socia, { name: '', short: '', initial: '' });
});

test('construirDatosPortal: los filtros solo traen tipos que están en las clases', () => {
  const datos = construirDatosPortal({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z')],
    tiposClase: [tipo('t1', 'Reformer'), tipo('t9', 'Nunca programado')],
  });
  assert.deepEqual(datos.filtros.map((f) => f.key), ['todas', 't1']);
});
