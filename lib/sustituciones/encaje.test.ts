import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encajeDe } from './encaje.ts';

test('sin historial: barra sí, porcentaje NO', () => {
  const e = encajeDe({ compatibilidad: 99, prob_aceptacion: null, prob_aceptadas: 0, prob_ofertas: 0 });
  assert.equal(e.barra, 99);
  assert.equal(e.probabilidad, null);
  assert.equal(e.etiqueta, null);
  assert.equal(e.respaldo, null);
});

test('ranking viejo (sin los campos de predicción) no revienta ni inventa nada', () => {
  const e = encajeDe({ compatibilidad: 85 });
  assert.equal(e.barra, 85);
  assert.equal(e.probabilidad, null);
  assert.equal(e.etiqueta, null);
});

test('ausencia de probabilidad NUNCA se trata como un 0 %', () => {
  const sinDato = encajeDe({ compatibilidad: 70 });
  const conCero = encajeDe({ compatibilidad: 70, prob_aceptacion: 0, prob_aceptadas: 0, prob_ofertas: 8 });
  assert.equal(sinDato.probabilidad, null);
  assert.equal(sinDato.etiqueta, null);
  // El 0 real sí se dice, y con su respaldo: son cosas distintas.
  assert.equal(conCero.probabilidad, '0 %');
  assert.equal(conCero.etiqueta, 'Rara vez acepta');
  assert.equal(conCero.respaldo, 'ha dicho que sí 0 de las últimas 8 veces');
});

test('con historial: porcentaje, etiqueta y respaldo con las cifras', () => {
  const e = encajeDe({ compatibilidad: 99, prob_aceptacion: 0.817, prob_aceptadas: 9, prob_ofertas: 10 });
  assert.equal(e.probabilidad, '82 %');
  assert.equal(e.etiqueta, 'Suele aceptar');
  assert.equal(e.respaldo, 'ha dicho que sí 9 de las últimas 10 veces');
});

test('los tres tramos de etiqueta', () => {
  assert.equal(encajeDe({ prob_aceptacion: 0.9 }).etiqueta, 'Suele aceptar');
  assert.equal(encajeDe({ prob_aceptacion: 0.5 }).etiqueta, 'Responde a veces');
  assert.equal(encajeDe({ prob_aceptacion: 0.2 }).etiqueta, 'Rara vez acepta');
});

test('la barra se acota a 0..100 aunque llegue basura', () => {
  assert.equal(encajeDe({ compatibilidad: 250 }).barra, 100);
  assert.equal(encajeDe({ compatibilidad: -40 }).barra, 0);
  assert.equal(encajeDe({}).barra, 0);
});

test('probabilidad sin cifras de respaldo: se enseña el número pero no una frase a medias', () => {
  const e = encajeDe({ compatibilidad: 90, prob_aceptacion: 0.7 });
  assert.equal(e.probabilidad, '70 %');
  assert.equal(e.respaldo, null);
});
