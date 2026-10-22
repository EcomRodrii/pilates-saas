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
import fs from 'node:fs';
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
  //
  // 7-oct-2026: placa OSCURA del kit, no la de color. El fundador: el icono
  // «parece hecho con IA con ese fondo» (el degradado turquesa→magenta a toda la
  // placa). La oscura es del mismo kit y deja el color solo en el tallo.
  ['public/icon-192.png', 'icono-app/tentare-icono-oscuro.svg', CAJA.placa, 192],
  ['public/icon-512.png', 'icono-app/tentare-icono-oscuro.svg', CAJA.placa, 512],
  ['app/apple-icon.png', 'icono-app/tentare-icono-oscuro.svg', CAJA.placa, 180],
  // Favicons por convención de fichero de Next (más `app/icon.svg`, la versión
  // vectorial, que copia este mismo SVG). Regla 5 del kit: por debajo de 24 px
  // a una tinta. Hasta el 7-oct eran el isotipo suelto, sin placa: borroso a
  // 16 px y, con la pestaña en modo oscuro, las hojas color tinta desaparecían
  // y quedaba solo el tallo. La placa oscura con la «t» en blanco se lee igual
  // sobre una pestaña clara que sobre una oscura.
  ['app/icon1.png', 'favicon/tentare-favicon-placa.svg', CAJA.placa, 256],
  ['app/icon2.png', 'favicon/tentare-favicon-placa.svg', CAJA.placa, 48],
  ['app/icon3.png', 'favicon/tentare-favicon-placa.svg', CAJA.placa, 32],
  ['app/icon4.png', 'favicon/tentare-favicon-placa.svg', CAJA.placa, 16],
];

const TAMANOS_ICO = [16, 32, 48];

function prepara(svg, viewBox, soloClase) {
  // OJO: el width/height a quitar es el de la etiqueta <svg> raíz, no el de
  // cualquier elemento del dibujo — un regex global sobre todo el string
  // también se comía el width/height del <rect> de fondo de los iconos de
  // app (icono-app/*.svg), que sin ellos mide 0×0 y desaparece: el icono
  // salía con la T en blanco pero sin la placa de color detrás.
  let s = svg.replace(/^<svg\b[^>]*>/, (etiqueta) => etiqueta
    .replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
    .replace(/\s(width|height)="[^"]*"/g, ''));
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

const ico = empaquetaIco(await Promise.all(TAMANOS_ICO.map(async px => ({
  px,
  datos: (await pinta('favicon/tentare-favicon-placa.svg', CAJA.placa, px)).datos,
}))));
// En `public/` y NO en `app/`: Next inyecta el `favicon.ico` de `app/` en TODAS
// las rutas y una ruta hija no puede quitarlo, así que la marca de Tentare
// competía con la del estudio en su propia pestaña. Las páginas de Tentare
// siguen teniendo sus iconos (`app/icon1..4.png`, `app/apple-icon.png`), que sí
// ceden ante los `icons` de una ruta hija.
fs.writeFileSync(path.join(REPO, 'public/favicon.ico'), ico);
// La versión vectorial: nítida a cualquier densidad de pantalla (Chrome y
// Firefox la prefieren; Safari usa los PNG de arriba).
fs.copyFileSync(path.join(KIT, 'favicon/tentare-favicon-placa.svg'), path.join(REPO, 'app/icon.svg'));
hechos.push('app/icon.svg'.padEnd(38) + ' vectorial');
hechos.push(`public/favicon.ico`.padEnd(38) + ` ${TAMANOS_ICO.join('/')}  ${(ico.length / 1024).toFixed(0)} KB`);

await navegador.close();
console.log(hechos.join('\n'));
