import { test } from 'node:test';
import assert from 'node:assert/strict';
import { especialidadPrincipalDe, resultadosBusqueda, resultadosPopulares } from './portal-busqueda.ts';
import type { Instructor, Reserva, Sesion, TipoClase } from './types.ts';

function tipoClase(over: Partial<TipoClase>): TipoClase {
  return {
    id: 'tc-1', studioId: 's1', nombre: 'Reformer', color: '#123456', duracionMinutos: 50,
    descripcion: null, nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null,
    reservaExigirPlan: null, reservaVentanaMinimaMinutos: null,
    ...over,
  } as TipoClase;
}

function instructor(over: Partial<Instructor>): Instructor {
  return {
    id: 'i-1', studioId: 's1', nombre: 'Marta', email: null, telefono: null, color: '#654321',
    activo: true, avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null, bio: null,
    ...over,
  } as Instructor;
}

function sesion(over: Partial<Sesion>): Sesion {
  return {
    id: 's-1', studioId: 's1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'i-1',
    inicio: new Date().toISOString(), fin: new Date().toISOString(), aforoMaximo: 10,
    cancelada: false, notas: null, precioPuntual: null,
    ...over,
  } as Sesion;
}

function reserva(over: Partial<Reserva>): Reserva {
  return {
    id: 'r-1', studioId: 's1', sesionId: 's-1', socioId: 'soc-1', estado: 'CONFIRMADA',
    spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: new Date().toISOString(),
    ...over,
  } as Reserva;
}

test('especialidadPrincipalDe: el tipo de clase más impartido, ignora sesiones canceladas', () => {
  const tipos = [tipoClase({ id: 'tc-reformer', nombre: 'Reformer' }), tipoClase({ id: 'tc-mat', nombre: 'Mat' })];
  const sesiones = [
    sesion({ id: 's1', instructorId: 'i-1', tipoClaseId: 'tc-reformer' }),
    sesion({ id: 's2', instructorId: 'i-1', tipoClaseId: 'tc-reformer' }),
    sesion({ id: 's3', instructorId: 'i-1', tipoClaseId: 'tc-mat' }),
    sesion({ id: 's4', instructorId: 'i-1', tipoClaseId: 'tc-mat', cancelada: true }),
    sesion({ id: 's5', instructorId: 'i-1', tipoClaseId: 'tc-mat', cancelada: true }),
  ];
  const resultado = especialidadPrincipalDe('i-1', sesiones, tipos);
  assert.equal(resultado?.nombre, 'Reformer');
});

test('especialidadPrincipalDe: sin sesiones no canceladas de esa instructora → null', () => {
  assert.equal(especialidadPrincipalDe('i-2', [sesion({ instructorId: 'i-1' })], [tipoClase({})]), null);
});

test('resultadosBusqueda: cruza tipos de clase e instructoras activas por nombre, sin acentos ni mayúsculas', () => {
  const tipos = [tipoClase({ id: 'tc-1', nombre: 'Pilates Reformer' })];
  const instructores = [instructor({ id: 'i-1', nombre: 'María' })];
  const r1 = resultadosBusqueda({ query: 'reformer', tiposClase: tipos, instructores, sesiones: [], slug: 'demo' });
  assert.equal(r1.length, 1);
  assert.equal(r1[0].tipo, 'tipo_clase');
  assert.equal(r1[0].href, '/portal/demo/clases?tipo=tc-1');

  const r2 = resultadosBusqueda({ query: 'maria', tiposClase: tipos, instructores, sesiones: [], slug: 'demo' });
  assert.equal(r2.length, 1);
  assert.equal(r2[0].tipo, 'instructor');
  assert.equal(r2[0].href, '/portal/demo/instructores/i-1');
});

test('resultadosBusqueda: nunca devuelve una instructora inactiva', () => {
  const instructores = [instructor({ id: 'i-1', nombre: 'Marta', activo: false })];
  const r = resultadosBusqueda({ query: 'marta', tiposClase: [], instructores, sesiones: [], slug: 'demo' });
  assert.equal(r.length, 0);
});

test('resultadosBusqueda: query vacía → sin resultados (no todo el catálogo)', () => {
  const tipos = [tipoClase({})];
  const r = resultadosBusqueda({ query: '   ', tiposClase: tipos, instructores: [], sesiones: [], slug: 'demo' });
  assert.deepEqual(r, []);
});

test('resultadosPopulares: sin ninguna reserva reciente ni instructora valorada → []', () => {
  const r = resultadosPopulares({
    tiposClase: [tipoClase({})], instructores: [instructor({})], sesiones: [], reservas: [],
    ahora: new Date(), slug: 'demo',
  });
  assert.deepEqual(r, []);
});

test('resultadosPopulares: el tipo de clase más reservado en la ventana reciente, ignora reservas fuera de ventana', () => {
  const ahora = new Date('2026-08-28T12:00:00Z');
  const tipos = [tipoClase({ id: 'tc-reformer', nombre: 'Reformer' }), tipoClase({ id: 'tc-mat', nombre: 'Mat' })];
  const sesiones = [
    sesion({ id: 's-reciente', tipoClaseId: 'tc-reformer', inicio: new Date('2026-08-20T09:00:00Z').toISOString() }),
    // fuera de la ventana de 28 días — no debe contar aunque tenga más reservas
    sesion({ id: 's-vieja', tipoClaseId: 'tc-mat', inicio: new Date('2026-01-01T09:00:00Z').toISOString() }),
  ];
  const reservas = [
    reserva({ id: 'r1', sesionId: 's-reciente', estado: 'CONFIRMADA' }),
    reserva({ id: 'r2', sesionId: 's-reciente', estado: 'CANCELADA' }), // no ocupa plaza, no cuenta
    reserva({ id: 'r3', sesionId: 's-vieja', estado: 'CONFIRMADA' }),
    reserva({ id: 'r4', sesionId: 's-vieja', estado: 'CONFIRMADA' }),
  ];
  const r = resultadosPopulares({ tiposClase: tipos, instructores: [], sesiones, reservas, ahora, slug: 'demo' });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'tc-reformer');
  assert.match(r[0].meta, /1 reserva/);
});

test('resultadosPopulares: la instructora con mejor nota, solo si llega al mínimo de valoraciones', () => {
  const instructores = [
    instructor({ id: 'i-pocas', nombre: 'Con pocas', valoracion: { media: 5, total: 2 } }), // por debajo del mínimo
    instructor({ id: 'i-buena', nombre: 'Con muchas', valoracion: { media: 4.5, total: 20 } }),
    instructor({ id: 'i-inactiva', nombre: 'Inactiva', activo: false, valoracion: { media: 5, total: 30 } }),
  ];
  const r = resultadosPopulares({
    tiposClase: [], instructores, sesiones: [], reservas: [], ahora: new Date(), slug: 'demo',
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'i-buena');
  assert.equal(r[0].tipo, 'instructor');
});

test('resultadosPopulares: puede devolver las dos filas a la vez, cada una con su propio dato', () => {
  const ahora = new Date('2026-08-28T12:00:00Z');
  const tipos = [tipoClase({ id: 'tc-1', nombre: 'Reformer' })];
  const instructores = [instructor({ id: 'i-1', nombre: 'Marta', valoracion: { media: 4.8, total: 10 } })];
  const sesiones = [sesion({ id: 's1', tipoClaseId: 'tc-1', inicio: new Date('2026-08-25T09:00:00Z').toISOString() })];
  const reservas = [reserva({ id: 'r1', sesionId: 's1', estado: 'ASISTIDA' })];
  const r = resultadosPopulares({ tiposClase: tipos, instructores, sesiones, reservas, ahora, slug: 'demo' });
  assert.equal(r.length, 2);
  assert.equal(r[0].tipo, 'tipo_clase');
  assert.equal(r[1].tipo, 'instructor');
});
