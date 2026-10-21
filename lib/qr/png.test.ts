import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import jsQR from 'jsqr';
import { LADO_PNG_QR, pngQr } from './png.ts';

// El QR en PNG del correo «Ya puedes recibir reservas»: se lee de vuelta con el
// mismo lector que usa el panel (jsqr), desde los bytes del PNG.

/** Lee el PNG que escribe `pngQr` (gris de 1 bit, filtro 0) a RGBA. */
function leerPng(png: Buffer): { ancho: number; alto: number; rgba: Uint8ClampedArray; tipos: string[] } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'firma PNG');
  let i = 8;
  let ancho = 0, alto = 0;
  const idat: Buffer[] = [];
  const tipos: string[] = [];
  while (i < png.length) {
    const largo = png.readUInt32BE(i);
    const tipo = png.toString('ascii', i + 4, i + 8);
    const datos = png.subarray(i + 8, i + 8 + largo);
    tipos.push(tipo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      assert.equal(datos[8], 1, '1 bit por píxel');
      assert.equal(datos[9], 0, 'escala de grises');
    }
    if (tipo === 'IDAT') idat.push(datos);
    i += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const bytesFila = Math.ceil(ancho / 8);
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    const base = y * (bytesFila + 1);
    assert.equal(crudo[base], 0, 'filtro 0');
    for (let x = 0; x < ancho; x++) {
      const blanco = (crudo[base + 1 + (x >> 3)] >> (7 - (x & 7))) & 1;
      const v = blanco ? 255 : 0;
      rgba.set([v, v, v, 255], (y * ancho + x) * 4);
    }
  }
  return { ancho, alto, rgba, tipos };
}

test('el PNG es un QR que se lee y abre la página de reservas', () => {
  const url = 'https://tentare.app/reservar/estudio-ejemplo';
  const png = pngQr(url);
  const { ancho, alto, rgba, tipos } = leerPng(png);
  assert.deepEqual(tipos, ['IHDR', 'IDAT', 'IEND']);
  assert.equal(ancho, alto);
  assert.ok(ancho <= LADO_PNG_QR && ancho > LADO_PNG_QR / 2, `lado ${ancho}`);
  const leido = jsQR(rgba, ancho, alto);
  assert.equal(leido?.data, url);
  // Pesa poco: va en un correo.
  assert.ok(png.length < 8_000, `${png.length} bytes`);
});

test('el mismo texto da siempre el mismo PNG (se puede cachear para siempre)', () => {
  const a = pngQr('https://tentare.app/reservar/otro');
  const b = pngQr('https://tentare.app/reservar/otro');
  assert.ok(a.equals(b));
  assert.ok(!a.equals(pngQr('https://tentare.app/reservar/otro-mas')));
});
