import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EJERCICIOS_SESION_GUIADA, esUltimoEjercicio, saltarEjercicio, progresoEjercicio,
} from './sesion-guiada.ts';

test('EJERCICIOS_SESION_GUIADA: 4 ejercicios fijos, calcados del prototipo', () => {
  assert.equal(EJERCICIOS_SESION_GUIADA.length, 4);
  assert.deepEqual(EJERCICIOS_SESION_GUIADA.map((e) => e.nombre), [
    'Flexión lateral sentada', 'Puente de hombros', 'Cien clásico', 'Estiramiento de columna',
  ]);
});

test('esUltimoEjercicio: solo el índice final cuenta como último', () => {
  assert.equal(esUltimoEjercicio(0), false);
  assert.equal(esUltimoEjercicio(2), false);
  assert.equal(esUltimoEjercicio(3), true);
});

test('saltarEjercicio: avanza/retrocede sin salirse del rango', () => {
  assert.equal(saltarEjercicio(0, -1), 0); // no hay "anterior" al primero
  assert.equal(saltarEjercicio(1, -1), 0);
  assert.equal(saltarEjercicio(0, 1), 1);
  assert.equal(saltarEjercicio(3, 1), 3); // no hay "siguiente" al último — el bug del prototipo, corregido
});

test('progresoEjercicio: 0% al empezar, 100% al llegar a 0 segundos', () => {
  // Ejercicio 0 dura 50s.
  assert.equal(progresoEjercicio(0, 50), 0);
  assert.equal(progresoEjercicio(0, 25), 50);
  assert.equal(progresoEjercicio(0, 0), 100);
});
