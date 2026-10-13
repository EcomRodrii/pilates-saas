// PNG RGB de 8 bits SIN canal alfa, escrito a mano. App Store Connect rechaza un icono
// con transparencia aunque sea totalmente opaco, así que no vale guardar la captura
// tal cual: se leen los píxeles y se escribe el PNG con tipo de color 2.
// Lo usan scripts/iconos-ios.mjs (la app «Tentare») y scripts/app-estudio.mjs (la de un estudio).

import zlib from 'node:zlib';

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
/** Píxeles RGB (3 bytes cada uno, sin alfa) → PNG RGB de 8 bits. */
export function pngRgb(rgb, ancho, alto) {
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    // Cada fila empieza con su byte de filtro (0: ninguno).
    rgb.copy(filas, y * (ancho * 3 + 1) + 1, y * ancho * 3, (y + 1) * ancho * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB, sin alfa
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

