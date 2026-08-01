import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redondearAIntervalo, minutosDesdeOffset, nuevoHorarioArrastrado } from './calendario-arrastre.ts';

test('redondearAIntervalo: valor ya en un múltiplo de 15 no cambia', () => {
  assert.equal(redondearAIntervalo(120), 120);
});

test('redondearAIntervalo: redondea hacia abajo por debajo de la mitad', () => {
  assert.equal(redondearAIntervalo(127), 120); // 127 -> 8.46 cuartos -> 8 -> 120
});

test('redondearAIntervalo: redondea hacia arriba a partir de la mitad', () => {
  assert.equal(redondearAIntervalo(128), 135); // 128 -> 8.53 cuartos -> 9 -> 135
});

test('redondearAIntervalo: acepta un paso distinto de 15', () => {
  assert.equal(redondearAIntervalo(50, 30), 60);
});

test('minutosDesdeOffset: offset 0 vuelve a horaInicioMin', () => {
  assert.equal(minutosDesdeOffset(0, 96, 8 * 60), 8 * 60);
});

test('minutosDesdeOffset: una hora completa de offset suma 60 minutos', () => {
  assert.equal(minutosDesdeOffset(96, 96, 8 * 60), 9 * 60);
});

test('minutosDesdeOffset: aplica el snap de 15 min sobre el resultado', () => {
  // 50px a 96px/hora = 31.25 min -> 8:00 + 31 -> 8:31 -> redondea a 8:30 (510).
  assert.equal(minutosDesdeOffset(50, 96, 8 * 60), 510);
});

test('minutosDesdeOffset: offset negativo (por encima del grid) no se clampa aquí', () => {
  assert.equal(minutosDesdeOffset(-96, 96, 8 * 60), 7 * 60);
});

test('nuevoHorarioArrastrado: conserva la duración original', () => {
  const r = nuevoHorarioArrastrado(50, 600);
  assert.equal(r.inicioMin, 600);
  assert.equal(r.finMin, 650);
});
