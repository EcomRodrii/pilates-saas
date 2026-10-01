import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseDelMostrador, siguienteClase, vecinas, type ClaseDelDia } from './mostrador.ts';

// Jueves 1 de octubre de 2026, horas en UTC (Madrid = UTC+2).
const c = (id: string, ini: string, fin: string, cancelada = false): ClaseDelDia => ({
  id, inicio: `2026-10-01T${ini}:00.000Z`, fin: `2026-10-01T${fin}:00.000Z`, cancelada,
});
const DIA = [c('08:00', '06:00', '06:50'), c('10:30', '08:30', '09:20'), c('11:00', '09:00', '09:50'), c('18:00', '16:00', '16:50')];
const a = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00.000Z`);

test('con una clase en curso y nada a punto de empezar, el mostrador abre la de ahora', () => {
  assert.equal(claseDelMostrador(DIA, a('08:40')), '10:30');
});

test('quien entra a las 10:55 viene a la de las 11, no a la que lleva media hora', () => {
  assert.equal(claseDelMostrador(DIA, a('08:55')), '11:00');
});

test('entre clases, la siguiente; con el día acabado, ninguna', () => {
  assert.equal(claseDelMostrador(DIA, a('12:00')), '18:00');
  assert.equal(claseDelMostrador(DIA, a('17:00')), null);
});

test('una clase cancelada no se abre sola', () => {
  assert.equal(claseDelMostrador([c('x', '08:30', '09:20', true), c('y', '16:00', '16:50')], a('08:40')), 'y');
  assert.equal(siguienteClase(DIA, a('08:40')), '11:00');
});

test('‹ › pasan a la de antes y a la de después', () => {
  const orden = ['a', 'b', 'c'];
  assert.deepEqual(vecinas(orden, 'b'), { anterior: 'a', siguiente: 'c' });
  assert.deepEqual(vecinas(orden, 'a'), { anterior: null, siguiente: 'b' });
  assert.deepEqual(vecinas(orden, 'z'), { anterior: null, siguiente: null });
});

test('dos clases a la misma hora: siempre la misma, lleguen en el orden que lleguen', () => {
  const reformer = { id: 'ses-b', inicio: '2026-10-01T08:00:00.000Z', fin: '2026-10-01T08:55:00.000Z', cancelada: false };
  const mat = { id: 'ses-a', inicio: '2026-10-01T08:00:00.000Z', fin: '2026-10-01T08:55:00.000Z', cancelada: false };
  const abierto = new Date('2026-10-01T07:30:00.000Z'); // check-in abierto en las dos
  assert.equal(claseDelMostrador([reformer, mat], abierto), claseDelMostrador([mat, reformer], abierto));
  const antesDeAbrir = new Date('2026-10-01T06:00:00.000Z'); // ninguna abierta: la siguiente
  assert.equal(siguienteClase([reformer, mat], antesDeAbrir), siguienteClase([mat, reformer], antesDeAbrir));
});
