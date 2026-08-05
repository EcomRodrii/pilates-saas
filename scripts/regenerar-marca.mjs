// Regenera TODOS los derivados ráster de la marca desde el kit SVG.
//
//   node scripts/regenerar-marca.mjs [ruta-al-kit]
//
// El kit (docs/marca/) es la única fuente de verdad del logotipo: en la app se
// pinta en línea con <LogoTentare> (components/marca/logo-tentare.tsx) y todo
// lo demás —iconos PWA, favicons, la cabecera de los correos de acceso de
// Supabase, las piezas de la intro— son PNG/WebP que salen de aquí. Si el
// isotipo cambia alguna vez, se vuelve a correr esto: si no, conviven dos
// marcas distintas a un clic de distancia.
//
// Se rasteriza con Chromium (playwright) y no con una librería de SVG porque es
// el mismo motor que pinta el kit en la app: lo que sale del PNG es exactamente
// lo que se ve en el navegador, degradados y curvas incluidos.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = process.argv[2] ?? path.join(REPO, 'docs/marca');

// Encuadres ceñidos al dibujo — los MISMOS que usa components/marca/logo-tentare.tsx.
// El lienzo del kit trae hasta un 22 % de aire abajo; usarlo tal cual es lo que
// hacía que un `height` acabara midiendo el aire en vez del logo.
const CAJA = {
  isotipo: '7 11 106 98',
  horizontal: '7 17 369.08 98',
  horizontalProducto: '7 17 369.08 111.22',
  vertical: '26.82 11 181.86 169.54',
  verticalProducto: '26.82 11 181.86 197.16',
  // Cuadrado para todo lo que ES un icono: un favicon o un .ico no cuadrado
  // se deforma. Es el mismo dibujo centrado en un lienzo de 106×106.
  isotipoCuadrado: '7 7 106 106',
  // Los iconos de app sí llevan su placa de fondo, que ocupa el lienzo entero.
  placa: '0 0 120 120',
};

/** [destino, svg del kit, encuadre, ancho en px] — el alto sale del encuadre. */
const TRABAJOS = [
  // Único lockup con consumidor real: la cabecera de los correos de acceso de
  // Supabase (supabase/templates/*.html) lo pide por URL absoluta. Los demás
  // (stacked, wordmark, mark, icon, y las variantes por producto) se borraron
  // al quedarse sin un solo llamador: la app pinta el logo en línea con
  // <LogoTentare>. Si vuelve a hacer falta alguno, se añade aquí y sale del
  // mismo kit — docs/marca/ los tiene todos en SVG.
  ['public/logo-horizontal.png', 'horizontal/tentare-horizontal-degradado.svg', CAJA.horizontal, 1200],
  // Iconos de app y de notificación push (app/manifest.ts, panel.webmanifest,
  // portal/[slug]/manifest.webmanifest, public/sw.js): placa completa.
  ['public/icon-192.png', 'icono-app/tentare-icono-color.svg', CAJA.placa, 192],
  ['public/icon-512.png', 'icono-app/tentare-icono-color.svg', CAJA.placa, 512],
  ['app/apple-icon.png', 'icono-app/tentare-icono-color.svg', CAJA.placa, 180],
  // Favicons por convención de fichero de Next. Regla 5 del kit: por debajo de
  // 24 px la separación de la «t» cae del píxel, así que ahí va la de una tinta.
  ['app/icon1.png', 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipoCuadrado, 256],
  ['app/icon2.png', 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipoCuadrado, 48],
  ['app/icon3.png', 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipoCuadrado, 32],
  ['app/icon4.png', 'favicon/tentare-favicon.svg', CAJA.isotipoCuadrado, 16],
];

/** Las cuatro piezas de la intro de la landing (components/landing/IntroLogo.tsx):
 *  mismo lienzo las cuatro, cada una con solo su trazado visible, para que
 *  superpuestas reconstruyan el isotipo exacto. */
const PIEZAS = [['asta', 't-tallo'], ['bol', 't-disco'], ['hoja-izq', 't-hoja-i'], ['hoja-der', 't-hoja-d']];
const ANCHO_PIEZA = 572; // 2× de los 266 px a los que se muestra
const TAMANOS_ICO = [16, 32, 48];

function prepara(svg, viewBox, soloClase) {
  let s = svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`).replace(/\s(width|height)="[^"]*"/g, '');
  if (soloClase) {
    s = s.replace(/<path class="(t-[\w-]+)"/g, (m, c) => (c === soloClase ? m : `<path class="${c}" visibility="hidden"`));
  }
  return s;
}

/** Empaqueta varios PNG en un .ico. Windows Vista+ y todos los navegadores
 *  actuales leen PNG dentro del contenedor, no hace falta BMP. */
function empaquetaIco(pngs) {
  const cabecera = Buffer.alloc(6 + 16 * pngs.length);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(pngs.length, 4);
  let offset = cabecera.length;
  pngs.forEach(({ px, datos }, i) => {
    const p = 6 + 16 * i;
    cabecera.writeUInt8(px >= 256 ? 0 : px, p);
    cabecera.writeUInt8(px >= 256 ? 0 : px, p + 1);
    cabecera.writeUInt16LE(1, p + 4); // planos
    cabecera.writeUInt16LE(32, p + 6); // bits por píxel
    cabecera.writeUInt32LE(datos.length, p + 8);
    cabecera.writeUInt32LE(offset, p + 12);
    offset += datos.length;
  });
  return Buffer.concat([cabecera, ...pngs.map(p => p.datos)]);
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
const hechos = [];

async function pinta(origen, viewBox, ancho, soloClase) {
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  const alto = Math.round((ancho * h) / w);
  await pagina.setViewportSize({ width: ancho, height: alto });
  await pagina.setContent(
    '<style>html,body{margin:0;padding:0;background:transparent}'
    + `svg{display:block;width:${ancho}px;height:${alto}px}</style>`
    + prepara(fs.readFileSync(path.join(KIT, origen), 'utf8'), viewBox, soloClase),
  );
  return { datos: await pagina.screenshot({ omitBackground: true }), ancho, alto };
}

async function escribe(destino, ...args) {
  const { datos, ancho, alto } = await pinta(...args);
  const ruta = path.join(REPO, destino);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, datos);
  hechos.push(`${destino.padEnd(38)} ${ancho}×${alto}  ${(datos.length / 1024).toFixed(0)} KB`);
}

for (const [destino, origen, viewBox, ancho] of TRABAJOS) await escribe(destino, origen, viewBox, ancho);

// Piezas de la intro: se rasterizan a PNG y se pasan a WebP, que es como las
// consume IntroLogo (28 KB las cuatro, frente a 412 KB en PNG).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-'));
for (const [nombre, clase] of PIEZAS) {
  const { datos, ancho, alto } = await pinta('isotipo/tentare-isotipo-degradado.svg', CAJA.isotipo, ANCHO_PIEZA, clase);
  const png = path.join(tmp, `${nombre}.png`);
  fs.writeFileSync(png, datos);
  const webp = path.join(REPO, `public/logo-piezas/${nombre}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', png, '-o', webp]);
  hechos.push(`public/logo-piezas/${nombre}.webp`.padEnd(38)
    + ` ${ancho}×${alto}  ${(fs.statSync(webp).size / 1024).toFixed(0)} KB`);
}

const ico = empaquetaIco(await Promise.all(TAMANOS_ICO.map(async px => ({
  px,
  datos: (await pinta(px < 24 ? 'favicon/tentare-favicon.svg' : 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipoCuadrado, px)).datos,
}))));
fs.writeFileSync(path.join(REPO, 'app/favicon.ico'), ico);
hechos.push(`app/favicon.ico`.padEnd(38) + ` ${TAMANOS_ICO.join('/')}  ${(ico.length / 1024).toFixed(0)} KB`);

await navegador.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(hechos.join('\n'));
