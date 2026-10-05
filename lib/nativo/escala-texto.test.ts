import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalaDeTexto } from './escala-texto.ts';

test('el tamaño por defecto de iOS (17 px) deja la app como está', () => {
  assert.equal(escalaDeTexto(17), 1);
});

test('«Texto más grande» agranda en proporción', () => {
  assert.equal(escalaDeTexto(19), 1.12);
  assert.equal(escalaDeTexto(21), 1.24);
});

test('los tamaños de accesibilidad se topan en 1,35', () => {
  assert.equal(escalaDeTexto(23), 1.35);
  assert.equal(escalaDeTexto(53), 1.35);
});

test('el texto más pequeño se topa en 0,9', () => {
  assert.equal(escalaDeTexto(14), 0.9);
  assert.equal(escalaDeTexto(15), 0.9);
});

test('una medida rota (0, NaN, fuera del WebKit de iOS) no cambia nada', () => {
  assert.equal(escalaDeTexto(0), 1);
  assert.equal(escalaDeTexto(Number.NaN), 1);
  assert.equal(escalaDeTexto(-3), 1);
});
