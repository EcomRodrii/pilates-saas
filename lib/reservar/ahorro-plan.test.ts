import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ahorroPorcentaje } from './ahorro-plan.ts';

test('un bono de 10 clases a 160 € frente a 20 € sueltas ahorra un 20 %', () => {
  assert.equal(ahorroPorcentaje({ precio: 160, sesiones: 10 }, 20), 20);
});

test('sin precio de clase suelta NO se inventa el ahorro', () => {
  // Es el caso más común: un estudio que solo vende bonos. Sin referencia, un
  // porcentaje ahí sería una cifra fabricada.
  assert.equal(ahorroPorcentaje({ precio: 160, sesiones: 10 }, null), null);
  assert.equal(ahorroPorcentaje({ precio: 160, sesiones: 10 }, undefined), null);
  assert.equal(ahorroPorcentaje({ precio: 160, sesiones: 10 }, 0), null);
});

test('una mensualidad no tiene precio por clase, así que no dice ahorro', () => {
  assert.equal(ahorroPorcentaje({ precio: 149, sesiones: null }, 20), null);
  assert.equal(ahorroPorcentaje({ precio: 149 }, 20), null);
  assert.equal(ahorroPorcentaje({ precio: 149, sesiones: 0 }, 20), null);
});

test('si no se ahorra, o sale más caro, se calla', () => {
  // «Ahorra un 0 %» es peor que el silencio; un ahorro negativo sería mentir.
  assert.equal(ahorroPorcentaje({ precio: 200, sesiones: 10 }, 20), null);
  assert.equal(ahorroPorcentaje({ precio: 260, sesiones: 10 }, 20), null);
});

test('redondea hacia ABAJO: prometer de más es lo que alguien comprueba', () => {
  // 10 clases a 161 € frente a 20 € = 19,5 % de ahorro. Decir 20 % es prometer
  // medio punto que no existe.
  assert.equal(ahorroPorcentaje({ precio: 161, sesiones: 10 }, 20), 19);
});

test('un plan gratis o con precio corrupto no rompe ni presume', () => {
  assert.equal(ahorroPorcentaje({ precio: 0, sesiones: 10 }, 20), null);
  assert.equal(ahorroPorcentaje({ precio: -5, sesiones: 10 }, 20), null);
});

test('un porcentaje EXACTO no se pierde por coma flotante', () => {
  // Regresión: `1 - 16/20` da 0.19999999999999996, y con el redondeo hacia
  // abajo el caso más redondo que existe se anunciaba como 19 %.
  assert.equal(ahorroPorcentaje({ precio: 160, sesiones: 10 }, 20), 20);
  assert.equal(ahorroPorcentaje({ precio: 90, sesiones: 5 }, 20), 10);
  assert.equal(ahorroPorcentaje({ precio: 75, sesiones: 5 }, 20), 25);
  // Y sigue sin redondear hacia arriba lo que no llega.
  assert.equal(ahorroPorcentaje({ precio: 161, sesiones: 10 }, 20), 19);
});
