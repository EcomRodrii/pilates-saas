import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaServicioCita, monogramaServicio, precioServicioCita, servicioMarcado } from './servicio-cita.ts';

test('duración y precio como en la referencia; 0 € es «Gratis»', () => {
  assert.equal(metaServicioCita({ duracionMin: 30, precio: 0 }), '30 min · Gratis');
  assert.equal(metaServicioCita({ duracionMin: 45, precio: 45 }), '45 min · 45 €');
  assert.equal(metaServicioCita({ duracionMin: 60, precio: 42.5 }), '60 min · 42,50 €');
});

test('sin precio fijado no se dice «Gratis»: en el panel es «se acuerda en cada caso»', () => {
  assert.equal(metaServicioCita({ duracionMin: 50, precio: null }), '50 min');
  assert.equal(metaServicioCita({ duracionMin: 50, precio: Number.NaN }), '50 min');
});

test('el precio sale igual en todo el flujo: «Gratis», «45 €», nunca «0.00 €»', () => {
  assert.equal(precioServicioCita(0), 'Gratis');
  assert.equal(precioServicioCita(45), '45 €');
  assert.equal(precioServicioCita(42.5), '42,50 €');
  // El botón «Continuar · …» y la hoja de confirmar usan esto: lo que dice la
  // opción marcada es lo que dicen ellos.
  assert.equal(metaServicioCita({ duracionMin: 15, precio: 0 }), `15 min · ${precioServicioCita(0)}`);
});

test('sin precio fijado no hay precio que enseñar: null, y quien lo pinta lo omite', () => {
  assert.equal(precioServicioCita(null), null);
  assert.equal(precioServicioCita(undefined), null);
  assert.equal(precioServicioCita(Number.NaN), null);
});

test('monograma: dos iniciales sin palabras de enlace, una si solo hay una palabra', () => {
  assert.equal(monogramaServicio('Valoración inicial'), 'VI');
  assert.equal(monogramaServicio('Sesión de valoración postural'), 'SV');
  assert.equal(monogramaServicio('Fisioterapia'), 'F');
  assert.equal(monogramaServicio('  clase   privada '), 'CP');
  assert.equal(monogramaServicio('Sesión 1:1'), 'S1');
  assert.equal(monogramaServicio('Ñ y Á'), 'ÑÁ');
});

test('monograma: si todo son palabras de enlace, se usan igual; vacío da vacío', () => {
  assert.equal(monogramaServicio('De la'), 'DL');
  assert.equal(monogramaServicio(''), '');
  assert.equal(monogramaServicio('—'), '');
});

test('siempre hay un servicio marcado: el elegido si sigue, si no el primero', () => {
  const servicios = [{ id: 'a' }, { id: 'b' }];
  assert.equal(servicioMarcado(servicios, null), 'a');
  assert.equal(servicioMarcado(servicios, 'b'), 'b');
  assert.equal(servicioMarcado(servicios, 'ya-no-existe'), 'a');
  assert.equal(servicioMarcado([], 'b'), null);
});
