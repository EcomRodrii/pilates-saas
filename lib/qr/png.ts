// ─────────────────────────────────────────────────────────────────────────────
// Un código QR en PNG, en el servidor y sin dependencias nuevas.
//
// Para el correo «Ya puedes recibir reservas» (alta nueva, PR-4): Gmail no
// pinta un SVG, así que el QR que va en el correo tiene que ser una imagen de
// verdad. El código sale del mismo codificador que los carteles y las facturas
// (`tramosQr`, lib/qr/escaparate.ts → lib/vendor/qrcodegen.ts) y el PNG se
// escribe a mano: escala de grises de 1 bit por píxel (blanco o negro), un
// IDAT comprimido con zlib y su CRC. Es lo mínimo del estándar PNG y lo lee
// cualquier cliente de correo.
//
// Solo servidor (usa `node:zlib`). Lo prueba png.test.ts leyéndolo de vuelta con
// el mismo lector de QR que usa el panel (jsqr).
// ─────────────────────────────────────────────────────────────────────────────

import { deflateSync } from 'node:zlib';
import { tramosQr } from './escaparate.ts';

/** Lado del PNG del correo: de sobra para un móvil y para imprimirlo pequeño. */
export const LADO_PNG_QR = 512;

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo: string, datos: Uint8Array): Buffer {
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(datos.length, 0);
  cab.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), datos])), 0);
  return Buffer.concat([cab, datos, crc]);
}

/**
 * El PNG del QR de `texto`, módulo a módulo a un número entero de píxeles
 * (nítido, sin suavizar), con la zona de silencio del estándar alrededor.
 * Negro sobre blanco: lo que mejor lee una cámara, también impreso.
 */
export function pngQr(texto: string, ladoMaximo = LADO_PNG_QR): Buffer {
  const { lado, tramos } = tramosQr(texto);
  const px = Math.max(1, Math.floor(ladoMaximo / lado));
  const ancho = lado * px;
  // Una fila de módulos en bits (1 = blanco, 0 = negro), repetida `px` veces.
  const bytesFila = Math.ceil(ancho / 8);
  const filas: Uint8Array[] = Array.from({ length: lado }, () => new Uint8Array(bytesFila).fill(0xff));
  for (const t of tramos) {
    const fila = filas[t.y];
    for (let x = t.x * px; x < (t.x + t.ancho) * px; x++) fila[x >> 3] &= ~(0x80 >> (x & 7));
  }
  const crudo = new Uint8Array((bytesFila + 1) * ancho);
  for (let y = 0; y < ancho; y++) {
    // Cada fila del PNG empieza con su filtro: 0, ninguno.
    crudo.set(filas[Math.floor(y / px)], y * (bytesFila + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(ancho, 4);
  ihdr[8] = 1; // 1 bit por píxel
  ihdr[9] = 0; // escala de grises
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sin entrelazar
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', new Uint8Array(0)),
  ]);
}
