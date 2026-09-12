import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precioPorSesion } from './precio-por-clase.ts';

test('divide el precio entre las sesiones', () => {
  assert.equal(precioPorSesion(96, 8), 12);
  assert.equal(precioPorSesion(56, 4), 14);
});

test('una clase suelta no tiene precio por clase: ya es su precio', () => {
  assert.equal(precioPorSesion(16, 1), null);
});

test('ilimitado no se divide entre nada', () => {
  assert.equal(precioPorSesion(89, null), null);
});

test('un precio de cero no se convierte en «0 €/clase»', () => {
  assert.equal(precioPorSesion(0, 8), null);
  assert.equal(precioPorSesion(-10, 8), null);
});

test('no se divide entre cero ni entre basura', () => {
  assert.equal(precioPorSesion(96, 0), null);
  assert.equal(precioPorSesion(96, Number.NaN), null);
  assert.equal(precioPorSesion(Number.NaN, 8), null);
});

test('deja el decimal cuando no es exacto — redondear miente sobre el precio', () => {
  // 100/3 = 33,33…: la tarjeta lo formatea con `euros`, que corta a 2
  // decimales. Lo que no puede hacer esta función es devolver 33 y que la
  // suma de tres clases no dé el precio del bono.
  assert.ok(Math.abs(precioPorSesion(100, 3)! - 33.3333) < 0.001);
});
