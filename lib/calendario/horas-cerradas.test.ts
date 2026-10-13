import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tramosCerrados, minutosDeHora } from './horas-cerradas.ts';

const dia = (a: number, c: number) => ({ abierto: true, aperturaMin: a * 60, cierreMin: c * 60 });

test('el lunes abre a las 9 y el eje arranca a las 8: de 8 a 9 está cerrado', () => {
  assert.deepEqual(tramosCerrados(dia(9, 21), 8 * 60, 21 * 60), [
    { desdeMin: 480, hastaMin: 540, diaEntero: false },
  ]);
});

test('cierra antes que el final del eje: queda cerrado el tramo de después', () => {
  assert.deepEqual(tramosCerrados(dia(8, 20), 8 * 60, 22 * 60), [
    { desdeMin: 1200, hastaMin: 1320, diaEntero: false },
  ]);
});

test('abre y cierra dentro del eje: cerrado por los dos lados', () => {
  assert.equal(tramosCerrados(dia(10, 20), 8 * 60, 22 * 60).length, 2);
});

test('el mismo horario que el eje no marca nada', () => {
  assert.deepEqual(tramosCerrados(dia(8, 22), 8 * 60, 22 * 60), []);
});

test('un día cerrado es cerrado entero', () => {
  assert.deepEqual(
    tramosCerrados({ abierto: false, aperturaMin: null, cierreMin: null }, 480, 1320),
    [{ desdeMin: 480, hastaMin: 1320, diaEntero: true }],
  );
});

test('sin dato del día no se afirma nada', () => {
  assert.deepEqual(tramosCerrados(undefined, 480, 1320), []);
  assert.deepEqual(tramosCerrados({ abierto: true, aperturaMin: null, cierreMin: null }, 480, 1320), []);
});

test('un horario que no cae en el eje no inventa tramos', () => {
  // Abre a las 6 con el eje desde las 8: nada cerrado por la mañana.
  assert.deepEqual(tramosCerrados(dia(6, 23), 8 * 60, 22 * 60), []);
});

test('minutosDeHora lee HH:MM:SS y rechaza lo que no es hora', () => {
  assert.equal(minutosDeHora('09:30:00'), 570);
  assert.equal(minutosDeHora('9:05'), 545);
  assert.equal(minutosDeHora(null), null);
  assert.equal(minutosDeHora('hola'), null);
});
