// Genera el icono y la pantalla de arranque de la app iOS desde el kit de marca.
//
//   npm run iconos:ios [-- ruta-al-kit]
//
// Mismo criterio que scripts/regenerar-marca.mjs: el kit (docs/marca/) es la
// única fuente y se rasteriza con Chromium (playwright), el mismo motor que
// pinta el logo en la web. Si el isotipo cambia, se vuelve a correr esto.
//
// Diferencias con los PNG de la web, y por qué:
//   - El icono va a sangre, SIN las esquinas redondeadas de la placa del kit
//     (`rx`): iOS pone su propia máscara, y una placa ya redondeada debajo deja
//     un filo de otro color en las esquinas.
//   - Y SIN canal alfa: App Store Connect rechaza un icono con transparencia,
//     aunque sea totalmente opaco. Por eso no se guarda la captura tal cual:
//     se leen los píxeles y se escribe un PNG RGB (tipo de color 2) a mano.
//   - La pantalla de arranque es un cuadrado de 2732 px que iOS recorta «a
//     llenar» (LaunchScreen.storyboard): el isotipo va pequeño en el centro
//     para que ningún recorte lo toque. Una clara y una oscura.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = process.argv[2] ?? path.join(REPO, 'docs/marca');
const ASSETS = path.join(REPO, 'ios/App/App/Assets.xcassets');

const LADO_ICONO = 1024;
const LADO_SPLASH = 2732;
const ANCHO_ISOTIPO_SPLASH = 400;
const CAJA_ISOTIPO = '7 11 106 98'; // la de regenerar-marca.mjs y logo-tentare.tsx

const leer = (rel) => fs.readFileSync(path.join(KIT, rel), 'utf8');

/** Cambia el encuadre del <svg> raíz y le quita el tamaño fijo (lo pone el lienzo). */
function encuadra(svg, viewBox) {
  return svg.replace(/^<svg\b[^>]*>/, (etiqueta) => etiqueta
    .replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
    .replace(/\s(width|height)="[^"]*"/g, ''));
}

// ─── PNG RGB sin alfa ──────────────────────────────────────────────────────

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
function pngRgb(rgb, ancho, alto) {
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

// ─── Pintar ────────────────────────────────────────────────────────────────

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

/**
 * Pinta un SVG en un lienzo de `lado`×`lado` con fondo opaco y devuelve sus
 * píxeles RGB (sin alfa). `caja` es dónde va el SVG dentro del lienzo, en px.
 */
async function pinta({ svg, lado, fondo, caja }) {
  const base64 = await pagina.evaluate(async ({ svg, lado, fondo, caja }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, caja.x, caja.y, caja.ancho, caja.alto);
    const rgba = ctx.getImageData(0, 0, lado, lado).data;
    const rgb = new Uint8Array((rgba.length / 4) * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    // En base64 y a trozos: devolver un array de millones de números por el
    // protocolo de Playwright tarda minutos.
    let binario = '';
    for (let i = 0; i < rgb.length; i += 0x8000) binario += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
    return btoa(binario);
  }, { svg, lado, fondo, caja });
  return Buffer.from(base64, 'base64');
}

const hechos = [];
function escribe(rel, png) {
  const ruta = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, png);
  hechos.push(`${rel.padEnd(42)} ${(png.length / 1024).toFixed(0)} KB`);
}

// Icono: la placa de color del kit, a sangre (sin `rx`).
const icono = encuadra(leer('icono-app/tentare-icono-color.svg'), '0 0 120 120')
  .replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');
escribe('AppIcon.appiconset/AppIcon-1024.png', pngRgb(
  await pinta({ svg: icono, lado: LADO_ICONO, fondo: '#4C9CB0', caja: { x: 0, y: 0, ancho: LADO_ICONO, alto: LADO_ICONO } }),
  LADO_ICONO, LADO_ICONO,
));

// Arranque: isotipo centrado, en clara y en oscura (fondos del kit).
const [, , w, h] = CAJA_ISOTIPO.split(' ').map(Number);
const altoIsotipo = Math.round((ANCHO_ISOTIPO_SPLASH * h) / w);
const centro = {
  x: Math.round((LADO_SPLASH - ANCHO_ISOTIPO_SPLASH) / 2),
  y: Math.round((LADO_SPLASH - altoIsotipo) / 2),
  ancho: ANCHO_ISOTIPO_SPLASH,
  alto: altoIsotipo,
};
for (const [fichero, origen, fondo] of [
  ['Splash.imageset/splash.png', 'isotipo/tentare-isotipo-degradado.svg', '#F8FAFC'],
  ['Splash.imageset/splash-oscuro.png', 'isotipo/tentare-isotipo-negativo.svg', '#111827'],
]) {
  escribe(fichero, pngRgb(
    await pinta({ svg: encuadra(leer(origen), CAJA_ISOTIPO), lado: LADO_SPLASH, fondo, caja: centro }),
    LADO_SPLASH, LADO_SPLASH,
  ));
}

await navegador.close();

// Los Contents.json, para que apunten a lo que acaba de salir y a nada más.
const contenidos = {
  'AppIcon.appiconset': {
    images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  },
  'Splash.imageset': {
    images: [
      { filename: 'splash.png', idiom: 'universal' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'splash-oscuro.png', idiom: 'universal' },
    ],
    info: { author: 'xcode', version: 1 },
  },
};
for (const [carpeta, json] of Object.entries(contenidos)) {
  const dir = path.join(ASSETS, carpeta);
  const validos = new Set([...json.images.map((i) => i.filename), 'Contents.json']);
  for (const f of fs.readdirSync(dir)) if (!validos.has(f)) fs.rmSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'Contents.json'), `${JSON.stringify(json, null, 2)}\n`);
}

console.log(hechos.join('\n'));
