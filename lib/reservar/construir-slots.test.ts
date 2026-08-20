import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirSlots, horarioDeSesion } from './construir-slots.ts';
import type { Sesion, TipoClase, Reserva } from '@/lib/types';

function tipo(over: Partial<TipoClase> = {}): TipoClase {
  return {
    id: 't1', studioId: 's1', nombre: 'Mat', color: '#000', duracionMinutos: 50,
    descripcion: null, nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null,
    ...over,
  } as TipoClase;
}
function sesion(over: Partial<Sesion> = {}): Sesion {
  return {
    id: 'ses1', studioId: 's1', tipoClaseId: 't1', salaId: 'sala1', instructorId: 'i1',
    inicio: '2026-08-20T10:00:00', fin: '2026-08-20T10:50:00', aforoMaximo: 10,
    cancelada: false, notas: null, precioPuntual: null,
    ...over,
  };
}

const NOW = new Date('2026-08-19T00:00:00').getTime();

test('excluye sesiones canceladas y pasadas', () => {
  const slots = construirSlots({
    sesiones: [
      sesion({ id: 'a', cancelada: true }),
      sesion({ id: 'b', inicio: '2026-08-01T10:00:00' }),
      sesion({ id: 'c' }),
    ],
    tiposClase: [tipo()], salas: [], instructores: [], reservas: [], spots: [],
    sustitucionesConfirmadas: [], suscripciones: [], planesTarifa: [], socia: null,
    nowMs: NOW,
  });
  assert.deepEqual(slots.map(s => s.id), ['c']);
});

test('cuenta ocupadas solo con reservas que ocupan plaza', () => {
  const reservas: Reserva[] = [
    { id: 'r1', studioId: 's1', sesionId: 'c', socioId: 'x', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '', ofertaExpiraEn: null },
    { id: 'r2', studioId: 's1', sesionId: 'c', socioId: 'y', estado: 'CANCELADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '', ofertaExpiraEn: null },
  ];
  const slots = construirSlots({
    sesiones: [sesion({ id: 'c' })], tiposClase: [tipo()], salas: [], instructores: [],
    reservas, spots: [], sustitucionesConfirmadas: [], suscripciones: [], planesTarifa: [],
    socia: null, nowMs: NOW,
  });
  assert.equal(slots[0].ocupadas, 1);
});

test('filtro por tipo excluye lo que no coincide', () => {
  const slots = construirSlots({
    sesiones: [sesion({ id: 'a', tipoClaseId: 't1' }), sesion({ id: 'b', tipoClaseId: 't2' })],
    tiposClase: [tipo({ id: 't1' }), tipo({ id: 't2', nombre: 'Reformer' })],
    salas: [], instructores: [], reservas: [], spots: [], sustitucionesConfirmadas: [],
    suscripciones: [], planesTarifa: [], socia: null, nowMs: NOW,
    filtros: { tipo: 't2' },
  });
  assert.deepEqual(slots.map(s => s.id), ['b']);
});

test('sin socia autenticada, nunca cubierta — siempre precio de clase suelta', () => {
  const slots = construirSlots({
    sesiones: [sesion()], tiposClase: [tipo()], salas: [], instructores: [], reservas: [],
    spots: [], sustitucionesConfirmadas: [], suscripciones: [],
    planesTarifa: [{ id: 'p1', studioId: 's1', tipo: 'PUNTUAL', activo: true, precio: 15 } as never],
    socia: null, nowMs: NOW,
  });
  assert.equal(slots[0].precio, 15);
});

test('horarioDeSesion clasifica por hora local', () => {
  assert.equal(horarioDeSesion('2026-08-20T08:00:00'), 'manana');
  assert.equal(horarioDeSesion('2026-08-20T13:00:00'), 'mediodia');
  assert.equal(horarioDeSesion('2026-08-20T19:00:00'), 'tarde');
});

test('filtros del snippet: listas de tipos/instructoras/salas y singulares por id', () => {
  const sesiones = [
    sesion({ id: 'a', tipoClaseId: 't1', instructorId: 'i1', salaId: 'sala1' }),
    sesion({ id: 'b', tipoClaseId: 't2', instructorId: 'i2', salaId: 'sala2' }),
    sesion({ id: 'c', tipoClaseId: 't3', instructorId: 'i3', salaId: 'sala3' }),
  ];
  const base = {
    sesiones, tiposClase: [tipo({ id: 't1' }), tipo({ id: 't2' }), tipo({ id: 't3' })],
    salas: [], instructores: [], reservas: [], spots: [], sustitucionesConfirmadas: [],
    suscripciones: [], planesTarifa: [], socia: null, nowMs: NOW,
  };
  assert.deepEqual(
    construirSlots({ ...base, filtros: { tipos: ['t1', 't3'] } }).map(s => s.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    construirSlots({ ...base, filtros: { instructoras: ['i2'] } }).map(s => s.id),
    ['b'],
  );
  assert.deepEqual(
    construirSlots({ ...base, filtros: { salas: ['sala1', 'sala2'] } }).map(s => s.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    construirSlots({ ...base, filtros: { instructorId: 'i3' } }).map(s => s.id),
    ['c'],
  );
  assert.deepEqual(
    construirSlots({ ...base, filtros: { salaId: 'sala2' } }).map(s => s.id),
    ['b'],
  );
  // Lista vacía = sin filtro, no "sin resultados".
  assert.equal(construirSlots({ ...base, filtros: { tipos: [] } }).length, 3);
});
