import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCalendario } from './calendario-auto.ts';
import type { Clase, Reserva } from './tipos.ts';

const AHORA = new Date('2026-10-07T12:00:00Z').getTime();
const clase = (id: string, inicio: string) => ({ id, inicio, fin: inicio } as unknown as Clase);
const reserva = (claseId: string, estado: Reserva['estado'] = 'confirmada'): Reserva =>
  ({ id: 'r-' + claseId, claseId, alumnaId: 'a', estado, creadaEn: '2026-10-01T00:00:00Z' });

const futura = clase('c1', '2026-10-08T07:00:00Z');
const otra = clase('c2', '2026-10-09T07:00:00Z');
const pasada = clase('c0', '2026-10-06T07:00:00Z');

test('crea las reservas confirmadas futuras que aún no están en el calendario', () => {
  const p = planCalendario([reserva('c1'), reserva('c2')], [futura, otra], { c2: 'ev2' }, AHORA);
  assert.deepEqual(p.crear.map((c) => c.id), ['c1']);
  assert.deepEqual(p.quitar, []);
});

test('quita la que canceló', () => {
  const p = planCalendario([reserva('c1', 'cancelada')], [futura], { c1: 'ev1' }, AHORA);
  assert.deepEqual(p.quitar, [['c1', 'ev1']]);
  assert.deepEqual(p.crear, []);
});

test('quita la que pasó a lista de espera', () => {
  const p = planCalendario([reserva('c1', 'en-espera')], [futura], { c1: 'ev1' }, AHORA);
  assert.deepEqual(p.quitar, [['c1', 'ev1']]);
});

test('una clase ya pasada no se borra de su calendario: solo sale de la memoria', () => {
  const p = planCalendario([reserva('c0', 'asistida')], [pasada], { c0: 'ev0' }, AHORA);
  assert.deepEqual(p.quitar, []);
  assert.deepEqual(p.olvidar, ['c0']);
});

test('lo que no se ve en el catálogo (ni clase ni reserva) no se toca', () => {
  const p = planCalendario([], [], { lejos: 'evX' }, AHORA);
  assert.deepEqual(p.quitar, []);
  assert.deepEqual(p.olvidar, []);
});

test('reserva cancelada de una clase que ya no sale en el catálogo: se quita', () => {
  const p = planCalendario([reserva('c9', 'cancelada')], [], { c9: 'ev9' }, AHORA);
  assert.deepEqual(p.quitar, [['c9', 'ev9']]);
});

test('una clase que ya empezó no se crea', () => {
  const p = planCalendario([reserva('c0')], [pasada], {}, AHORA);
  assert.deepEqual(p.crear, []);
});
