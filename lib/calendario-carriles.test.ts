import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asignarCarriles, type SlotCarril } from './calendario-carriles.ts';

const s = (id: string, inicioMin: number, finMin: number): SlotCarril => ({ id, inicioMin, finMin });

test('sin solapes, todas van al carril 0 y el total es 1 para cada una', () => {
  const { puesto, total } = asignarCarriles([s('a', 480, 540), s('b', 540, 600), s('c', 600, 660)]);
  assert.equal(puesto.get('a'), 0);
  assert.equal(puesto.get('b'), 0);
  assert.equal(puesto.get('c'), 0);
  assert.equal(total.get('a'), 1);
  assert.equal(total.get('b'), 1);
  assert.equal(total.get('c'), 1);
});

test('dos que se solapan van a carriles distintos, ambas con total=2', () => {
  const { puesto, total } = asignarCarriles([s('a', 480, 540), s('b', 500, 560)]);
  assert.notEqual(puesto.get('a'), puesto.get('b'));
  assert.equal(total.get('a'), 2);
  assert.equal(total.get('b'), 2);
});

test('tres solapando a la vez → tres carriles', () => {
  const { puesto, total } = asignarCarriles([s('a', 480, 600), s('b', 490, 550), s('c', 500, 560)]);
  const carriles = new Set([puesto.get('a'), puesto.get('b'), puesto.get('c')]);
  assert.equal(carriles.size, 3);
  assert.equal(total.get('a'), 3);
});

test('tocar exactamente en el borde (fin === inicio de la siguiente) NO es solape', () => {
  const { puesto, total } = asignarCarriles([s('a', 480, 540), s('b', 540, 600)]);
  assert.equal(puesto.get('a'), 0);
  assert.equal(puesto.get('b'), 0);
  assert.equal(total.get('a'), 1);
});

test('un carril libre se reutiliza en vez de abrir uno nuevo cuando ya cabe', () => {
  // a: 08:00-09:00, b: 08:30-09:30 (choca con a, carril 1), c: 09:00-10:00
  // (a ya terminó, cabe en el carril 0 de nuevo).
  const { puesto, total } = asignarCarriles([s('a', 480, 540), s('b', 510, 570), s('c', 540, 600)]);
  assert.equal(puesto.get('a'), 0);
  assert.equal(puesto.get('b'), 1);
  assert.equal(puesto.get('c'), 0);
});

test('grupos de solape separados en el tiempo no comparten total', () => {
  // Grupo 1 (a,b solapan, mañana): total 2. Grupo 2 (c sola, tarde): total 1.
  const { total } = asignarCarriles([s('a', 480, 540), s('b', 500, 560), s('c', 900, 960)]);
  assert.equal(total.get('a'), 2);
  assert.equal(total.get('c'), 1);
});

test('lista vacía no rompe nada', () => {
  const { puesto, total } = asignarCarriles([]);
  assert.equal(puesto.size, 0);
  assert.equal(total.size, 0);
});

test('un solo slot → carril 0, total 1', () => {
  const { puesto, total } = asignarCarriles([s('a', 480, 540)]);
  assert.equal(puesto.get('a'), 0);
  assert.equal(total.get('a'), 1);
});
