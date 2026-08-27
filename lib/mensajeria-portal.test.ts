import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructorasConRelacion } from './mensajeria-portal.ts';
import type { Instructor, Reserva, Sesion } from './types.ts';

function instructor(id: string, activo = true): Instructor {
  return { id, studioId: 's1', nombre: `Instructora ${id}`, email: null, telefono: null, color: '#000', activo, rol: 'INSTRUCTOR', authUserId: `auth-${id}` };
}

function sesion(id: string, instructorId: string): Sesion {
  return { id, studioId: 's1', tipoClaseId: 'tc', salaId: 'sala', instructorId, inicio: '2026-01-01T10:00:00Z', fin: '2026-01-01T11:00:00Z', aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null };
}

function reserva(sesionId: string, socioId: string, estado: Reserva['estado']): Reserva {
  return { id: `r-${sesionId}-${socioId}`, studioId: 's1', sesionId, socioId, estado, spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-01-01T00:00:00Z' };
}

test('sin socioId no ofrece ninguna instructora', () => {
  assert.deepEqual(instructorasConRelacion([instructor('i1')], [], [], null), []);
});

test('una reserva CONFIRMADA basta para tener relación', () => {
  const instructores = [instructor('i1'), instructor('i2')];
  const sesiones = [sesion('ses1', 'i1')];
  const reservas = [reserva('ses1', 'socio1', 'CONFIRMADA')];
  const resultado = instructorasConRelacion(instructores, reservas, sesiones, 'socio1');
  assert.deepEqual(resultado.map(i => i.id), ['i1']);
});

test('una reserva CANCELADA no cuenta como relación', () => {
  const instructores = [instructor('i1')];
  const sesiones = [sesion('ses1', 'i1')];
  const reservas = [reserva('ses1', 'socio1', 'CANCELADA')];
  assert.deepEqual(instructorasConRelacion(instructores, reservas, sesiones, 'socio1'), []);
});

test('la reserva de otra socia no cuenta', () => {
  const instructores = [instructor('i1')];
  const sesiones = [sesion('ses1', 'i1')];
  const reservas = [reserva('ses1', 'otra-socia', 'ASISTIDA')];
  assert.deepEqual(instructorasConRelacion(instructores, reservas, sesiones, 'socio1'), []);
});

test('una instructora inactiva no se ofrece aunque hubiera clase', () => {
  const instructores = [instructor('i1', false)];
  const sesiones = [sesion('ses1', 'i1')];
  const reservas = [reserva('ses1', 'socio1', 'ASISTIDA')];
  assert.deepEqual(instructorasConRelacion(instructores, reservas, sesiones, 'socio1'), []);
});

test('sin duplicar si hay varias clases con la misma instructora', () => {
  const instructores = [instructor('i1')];
  const sesiones = [sesion('ses1', 'i1'), sesion('ses2', 'i1')];
  const reservas = [reserva('ses1', 'socio1', 'ASISTIDA'), reserva('ses2', 'socio1', 'CONFIRMADA')];
  const resultado = instructorasConRelacion(instructores, reservas, sesiones, 'socio1');
  assert.equal(resultado.length, 1);
});
