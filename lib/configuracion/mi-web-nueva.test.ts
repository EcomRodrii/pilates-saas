import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentarSeccion, seccionVisual } from './mi-web-nueva.ts';
import { seccionPorId } from './secciones.ts';

test('apagado: las secciones se enseñan como siempre (el mismo objeto)', () => {
  const marca = seccionPorId('marca');
  assert.equal(presentarSeccion(marca, false), marca);
  assert.equal(seccionVisual('web', 'contenido-de-tu-app', false), 'web');
});

test('encendido: «Tu app» y «Tu web», y «Contenido de tu app» vuelve a «Tu app»', () => {
  assert.equal(presentarSeccion(seccionPorId('marca'), true).titulo, 'Tu app');
  assert.equal(presentarSeccion(seccionPorId('web'), true).titulo, 'Tu web');
  // Las demás no cambian, y las direcciones tampoco (el id es el de siempre).
  assert.equal(presentarSeccion(seccionPorId('estudio'), true), seccionPorId('estudio'));
  assert.equal(presentarSeccion(seccionPorId('web'), true).id, 'web');
  assert.equal(seccionVisual('web', 'contenido-de-tu-app', true), 'marca');
  assert.equal(seccionVisual('web', 'widgets', true), 'web');
  assert.equal(seccionVisual('web', null, true), 'web');
});
