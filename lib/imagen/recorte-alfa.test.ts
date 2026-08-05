import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCajaOpaca, mereceRecorte, UMBRAL_ALFA } from './recorte-alfa.ts';

/** Lienzo transparente con un rectángulo opaco dentro. */
function lienzo(ancho: number, alto: number, dibujo?: { x: number; y: number; w: number; h: number; alfa?: number }) {
  const px = new Uint8ClampedArray(ancho * alto * 4);
  if (!dibujo) return px;
  for (let y = dibujo.y; y < dibujo.y + dibujo.h; y++) {
    for (let x = dibujo.x; x < dibujo.x + dibujo.w; x++) {
      px[(y * ancho + x) * 4 + 3] = dibujo.alfa ?? 255;
    }
  }
  return px;
}

test('encuentra la caja del dibujo dentro del aire', () => {
  const px = lienzo(20, 10, { x: 4, y: 2, w: 6, h: 3 });
  assert.deepEqual(calcularCajaOpaca(px, 20, 10), { x: 4, y: 2, ancho: 6, alto: 3 });
});

test('un lienzo lleno devuelve el lienzo entero', () => {
  const px = lienzo(8, 8, { x: 0, y: 0, w: 8, h: 8 });
  assert.deepEqual(calcularCajaOpaca(px, 8, 8), { x: 0, y: 0, ancho: 8, alto: 8 });
});

test('todo transparente devuelve null: recortar a cero rompería la imagen', () => {
  assert.equal(calcularCajaOpaca(lienzo(8, 8), 8, 8), null);
});

test('un solo píxel opaco da una caja de 1×1', () => {
  const px = lienzo(8, 8, { x: 3, y: 5, w: 1, h: 1 });
  assert.deepEqual(calcularCajaOpaca(px, 8, 8), { x: 3, y: 5, ancho: 1, alto: 1 });
});

test('el halo de antialiasing no cuenta como dibujo', () => {
  // Sin umbral, este borde casi invisible devolvería el lienzo entero y el
  // recorte no haría nada — que es el fallo que motivó UMBRAL_ALFA.
  const px = lienzo(10, 10, { x: 0, y: 0, w: 10, h: 10, alfa: UMBRAL_ALFA });
  assert.equal(calcularCajaOpaca(px, 10, 10), null);

  const conTinta = lienzo(10, 10, { x: 2, y: 2, w: 3, h: 3 });
  for (let i = 3; i < conTinta.length; i += 4) conTinta[i] = Math.max(conTinta[i], UMBRAL_ALFA);
  assert.deepEqual(calcularCajaOpaca(conTinta, 10, 10), { x: 2, y: 2, ancho: 3, alto: 3 });
});

test('el caso real de producción: 1508×1043 de lienzo, 1451×297 de tinta', () => {
  // El logo que se vio a 9 px de alto en un correo. El ancho está aprovechado
  // (96%) pero el alto no (28%), y es el alto lo que fija el correo.
  const caja = { x: 28, y: 373, ancho: 1451, alto: 297 };
  assert.equal(mereceRecorte(caja, 1508, 1043), true);
});

test('no recorta un logo que ya viene ceñido', () => {
  assert.equal(mereceRecorte({ x: 0, y: 0, ancho: 1200, alto: 319 }, 1200, 319), false);
  // 2% de sobra por lado: por debajo del margen, no compensa recodificar.
  assert.equal(mereceRecorte({ x: 12, y: 3, ancho: 1176, alto: 313 }, 1200, 319), false);
});

test('recorta si sobra en un solo lado, aunque el otro esté aprovechado', () => {
  assert.equal(mereceRecorte({ x: 0, y: 0, ancho: 1000, alto: 200 }, 1000, 400), true);
  assert.equal(mereceRecorte({ x: 0, y: 0, ancho: 200, alto: 400 }, 1000, 400), true);
});

test('sin caja no hay nada que recortar', () => {
  assert.equal(mereceRecorte(null, 100, 100), false);
});
