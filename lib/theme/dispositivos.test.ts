import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalaParaCaber, altoOcupado, DISPOSITIVOS, DISPOSITIVO_IDS } from './dispositivos.ts';

test('los tres dispositivos, y solo el completo sin medidas', () => {
  assert.deepEqual(DISPOSITIVO_IDS, ['movil', 'tablet', 'completo']);
  assert.equal(DISPOSITIVOS.movil.ancho, 390, 'iPhone 12/13/14');
  assert.equal(DISPOSITIVOS.tablet.ancho, 768, 'iPad en vertical');
  assert.equal(DISPOSITIVOS.completo.ancho, null, 'ocupa lo que haya');
});

test('la etiqueta dice "Ancho completo", no "Escritorio"', () => {
  // El portal no tiene maquetación de escritorio: es la misma app estirada.
  // Llamarlo escritorio prometería algo que no existe.
  assert.equal(DISPOSITIVOS.completo.etiqueta, 'Ancho completo');
});

test('si cabe, no se toca — la escala es 1', () => {
  assert.equal(escalaParaCaber(900, 390), 1);
  assert.equal(escalaParaCaber(390, 390), 1, 'justo cabe');
});

test('nunca AGRANDA aunque sobre sitio', () => {
  // Un móvil de 390 en una columna de 1200 a escala 3 dejaría de parecerse a
  // un móvil, que es justo lo que se quiere juzgar.
  assert.equal(escalaParaCaber(1200, 390), 1);
});

test('encoge lo justo cuando no cabe — el caso de la tablet', () => {
  // La columna del preview mide ~616 px con el rail y el panel puestos, así
  // que una tablet de 768 SÍ tiene que encogerse. Sin esto, el iframe se
  // quedaría en 616 y renderizaría como un móvil ancho, no como una tablet.
  assert.equal(escalaParaCaber(616, 768), 616 / 768);
  assert.ok(escalaParaCaber(616, 768) < 1);
});

test('un contenedor sin medir todavía no colapsa el preview', () => {
  // Los observers dan 0 en el primer tick. Escalar a 0 dejaría el preview
  // invisible hasta la siguiente medición, con un parpadeo feo.
  assert.equal(escalaParaCaber(0, 390), 1);
  assert.equal(escalaParaCaber(-10, 390), 1);
  assert.equal(escalaParaCaber(Number.NaN, 390), 1);
  assert.equal(escalaParaCaber(Infinity, 390), 1);
});

test('un ancho de dispositivo absurdo tampoco rompe', () => {
  assert.equal(escalaParaCaber(600, 0), 1);
  assert.equal(escalaParaCaber(600, Number.NaN), 1);
});

test('altoOcupado devuelve el hueco REAL, no el declarado', () => {
  // `transform: scale()` no cambia el sitio que el elemento reserva en el
  // layout: sin corregirlo, una tablet encogida dejaría ~250 px de vacío
  // debajo. Se aplica como `height` al contenedor.
  assert.equal(altoOcupado(1024, 0.5), 512);
  assert.equal(altoOcupado(844, 1), 844, 'sin escalar, el alto es el suyo');
  assert.equal(altoOcupado(1024, 616 / 768), 821, 'la tablet en la columna real');
});
