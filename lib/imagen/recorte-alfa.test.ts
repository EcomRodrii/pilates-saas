import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCajaOpaca, encajeCentrado, fondoLiso, mereceRecorte, tintaClara, UMBRAL_ALFA } from './recorte-alfa.ts';

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

// ── Fondo liso (logo exportado sin transparencia) ───────────────────────────

const CREMA = { r: 245, g: 239, b: 232 };
const TINTA = { r: 139, g: 111, b: 90 };

/** Lienzo opaco de un color, con un rectángulo de otro dentro. */
function opaco(ancho: number, alto: number, fondo: typeof CREMA, dibujo?: { x: number; y: number; w: number; h: number; color: typeof CREMA }) {
  const px = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const dentro = dibujo && x >= dibujo.x && x < dibujo.x + dibujo.w && y >= dibujo.y && y < dibujo.y + dibujo.h;
      const c = dentro ? dibujo.color : fondo;
      const i = (y * ancho + x) * 4;
      px[i] = c.r; px[i + 1] = c.g; px[i + 2] = c.b; px[i + 3] = 255;
    }
  }
  return px;
}

test('un logo sin transparencia: detecta su fondo crema y recorta el aire', () => {
  // El caso medido: 1254×1254 crema y el dibujo en el centro. Por alfa todo es
  // «dibujo», así que el recorte de antes no hacía nada.
  const px = opaco(40, 40, CREMA, { x: 12, y: 8, w: 16, h: 20, color: TINTA });
  assert.deepEqual(calcularCajaOpaca(px, 40, 40), { x: 0, y: 0, ancho: 40, alto: 40 });
  const fondo = fondoLiso(px, 40, 40);
  assert.deepEqual(fondo, CREMA);
  assert.deepEqual(calcularCajaOpaca(px, 40, 40, UMBRAL_ALFA, fondo), { x: 12, y: 8, ancho: 16, alto: 20 });
});

test('el ruido de un JPG sigue contando como fondo', () => {
  const px = opaco(20, 20, CREMA, { x: 5, y: 5, w: 4, h: 4, color: TINTA });
  for (let i = 0; i < px.length; i += 4) px[i] = Math.min(255, px[i] + ((i / 4) % 7)); // ±6 por canal
  const fondo = fondoLiso(px, 20, 20);
  assert.ok(fondo);
  assert.deepEqual(calcularCajaOpaca(px, 20, 20, UMBRAL_ALFA, fondo), { x: 5, y: 5, ancho: 4, alto: 4 });
});

test('un dibujo que llega al borde no tiene fondo que quitar', () => {
  // Una foto, o un logo a sangre: recortar ahí sería comerse el dibujo.
  const px = opaco(20, 20, CREMA, { x: 0, y: 0, w: 20, h: 8, color: TINTA });
  assert.equal(fondoLiso(px, 20, 20), null);
});

test('un borde transparente lo resuelve el recorte por alfa, no este', () => {
  assert.equal(fondoLiso(lienzo(20, 20, { x: 5, y: 5, w: 4, h: 4 }), 20, 20), null);
});

// ── El icono del estudio ────────────────────────────────────────────────────

test('el símbolo va centrado, sin deformar, y ocupa el lienzo menos el margen', () => {
  // Apaisado: manda el ancho.
  assert.deepEqual(encajeCentrado(800, 400, 512, 0.08), { x: 41, y: 149, ancho: 430, alto: 215 });
  // Vertical: manda el alto.
  assert.deepEqual(encajeCentrado(300, 600, 512, 0.08), { x: 149, y: 41, ancho: 215, alto: 430 });
  // Cuadrado a 64: 54 px de dibujo, 5 de aire por lado.
  assert.deepEqual(encajeCentrado(900, 900, 64, 0.08), { x: 5, y: 5, ancho: 54, alto: 54 });
});

test('un símbolo en blanco sobre transparente no puede ir sobre blanco', () => {
  const blanco = lienzo(10, 10, { x: 2, y: 2, w: 6, h: 6 });
  for (let i = 0; i < blanco.length; i += 4) { blanco[i] = 255; blanco[i + 1] = 255; blanco[i + 2] = 255; }
  assert.equal(tintaClara(blanco, 10, 10), true);
});

test('un símbolo oscuro sobre fondo crema sí va sobre blanco', () => {
  const px = opaco(20, 20, CREMA, { x: 5, y: 5, w: 6, h: 6, color: TINTA });
  assert.equal(tintaClara(px, 20, 20, fondoLiso(px, 20, 20)), false);
});
