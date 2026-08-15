// Exporta el pack de marca para redes sociales desde el kit SVG.
//
//   node scripts/exportar-redes.mjs [ruta-al-kit] [destino]
//
// Hermano de regenerar-marca.mjs, con un consumidor distinto: aquel produce los
// derivados que la APP necesita (favicons, iconos PWA, cabecera de correos);
// este produce lo que se SUBE A MANO a un perfil (avatar, portada, post) y a
// los PNG sueltos que hay que mandar a una revista, un patrocinio o una
// plantilla de Canva. Por eso no escribe en public/ ni en app/: escribe en
// docs/marca/redes/, junto al kit del que sale.
//
// Ninguna pieza compuesta inventa copy: fondo de marca y logotipo, nada más.
// Un claim se decide, no se genera.
//
// Se rasteriza con Chromium (playwright) por el mismo motivo que el otro
// script: es el motor que pinta el kit en la app, así que el PNG es exactamente
// lo que se ve en el navegador, degradado incluido.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = process.argv[2] ?? path.join(REPO, 'docs/marca');
const DESTINO = process.argv[3] ?? path.join(KIT, 'redes');

// Encuadres ceñidos al dibujo — los MISMOS que usan regenerar-marca.mjs y
// components/marca/logo-tentare.tsx. El lienzo del kit trae hasta un 22 % de
// aire abajo: usarlo tal cual descentra el logo dentro de la pieza y deja la
// marca alta en un avatar (que además se recorta en círculo).
const CAJA = {
  isotipo: '7 11 106 98',
  horizontal: '7 17 369.08 98',
  vertical: '26.82 11 181.86 169.54',
};

const FONDO = {
  degradado: 'linear-gradient(135deg,#4C9CB0 0%,#B4537E 100%)', // el de marca, 135°
  claro: '#F8FAFC',
  oscuro: '#111827',
};

/** Pieza compuesta: fondo de marca + logotipo centrado.
 *  `anchoLogo` va en fracción del ANCHO de la pieza; en las piezas altas o muy
 *  apaisadas manda `altoMaxLogo` (fracción del alto), porque un logo medido
 *  solo por el ancho se sale de una portada de LinkedIn (1128×191) y se queda
 *  minúsculo en un story. */
const PIEZAS = [
  // — Foto de perfil. Cuadrada y con fondo opaco a propósito: un PNG
  //   transparente en un avatar lo rellena cada plataforma por su cuenta (negro
  //   en la mayoría). Casi todas recortan en círculo, así que el isotipo ocupa
  //   el 46 % y las esquinas van vacías: lo que se pierda en el recorte es aire.
  ['perfil/tentare-avatar-color-1024.png', 1024, 1024, FONDO.degradado, 'isotipo/tentare-isotipo-blanco.svg', CAJA.isotipo, { anchoLogo: 0.46 }],
  ['perfil/tentare-avatar-claro-1024.png', 1024, 1024, FONDO.claro, 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipo, { anchoLogo: 0.46 }],
  ['perfil/tentare-avatar-oscuro-1024.png', 1024, 1024, FONDO.oscuro, 'isotipo/tentare-isotipo-negativo.svg', CAJA.isotipo, { anchoLogo: 0.46 }],

  // — Portadas. Medidas de subida (no las de visualización): las plataformas
  //   sirven la imagen reescalada, y subir la grande es lo que evita el
  //   remuestreo sucio en pantallas de alta densidad.
  ['portadas/tentare-x-1500x500.png', 1500, 500, FONDO.degradado, 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, { anchoLogo: 0.42, altoMaxLogo: 0.34 }],
  ['portadas/tentare-linkedin-1128x191.png', 1128, 191, FONDO.degradado, 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, { anchoLogo: 0.34, altoMaxLogo: 0.46 }],
  ['portadas/tentare-facebook-1640x624.png', 1640, 624, FONDO.degradado, 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, { anchoLogo: 0.4, altoMaxLogo: 0.3 }],
  // YouTube sirve la misma imagen de 2560×1440 recortada a la pantalla: en un
  // móvil solo se ven los 1546×423 centrales. El logo se mide contra esa caja
  // segura, no contra el lienzo, o desaparece del recorte de móvil.
  ['portadas/tentare-youtube-2560x1440.png', 2560, 1440, FONDO.degradado, 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, { anchoLogo: 0.3, altoMaxLogo: 0.14 }],

  // — Publicaciones.
  ['publicaciones/tentare-post-1080-color.png', 1080, 1080, FONDO.degradado, 'vertical/tentare-vertical-blanco.svg', CAJA.vertical, { anchoLogo: 0.42 }],
  ['publicaciones/tentare-post-1080-claro.png', 1080, 1080, FONDO.claro, 'vertical/tentare-vertical-degradado.svg', CAJA.vertical, { anchoLogo: 0.42 }],
  ['publicaciones/tentare-story-1080x1920.png', 1080, 1920, FONDO.degradado, 'vertical/tentare-vertical-blanco.svg', CAJA.vertical, { anchoLogo: 0.44 }],
  // La que se ve al pegar un enlace de tentare en cualquier sitio (Open Graph).
  ['publicaciones/tentare-compartir-1200x630.png', 1200, 630, FONDO.degradado, 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, { anchoLogo: 0.55, altoMaxLogo: 0.3 }],
];

/** Logotipos sueltos, fondo transparente: [destino, svg del kit, encuadre, ancho]. */
const LOGOS = [
  ['logos/tentare-horizontal-degradado-2400.png', 'horizontal/tentare-horizontal-degradado.svg', CAJA.horizontal, 2400],
  ['logos/tentare-horizontal-blanco-2400.png', 'horizontal/tentare-horizontal-blanco.svg', CAJA.horizontal, 2400],
  ['logos/tentare-horizontal-tinta-2400.png', 'horizontal/tentare-horizontal-tinta.svg', CAJA.horizontal, 2400],
  ['logos/tentare-vertical-degradado-1600.png', 'vertical/tentare-vertical-degradado.svg', CAJA.vertical, 1600],
  ['logos/tentare-vertical-blanco-1600.png', 'vertical/tentare-vertical-blanco.svg', CAJA.vertical, 1600],
  ['logos/tentare-isotipo-degradado-1200.png', 'isotipo/tentare-isotipo-degradado.svg', CAJA.isotipo, 1200],
  ['logos/tentare-isotipo-blanco-1200.png', 'isotipo/tentare-isotipo-blanco.svg', CAJA.isotipo, 1200],
];

function prepara(svg, viewBox) {
  // Igual que en regenerar-marca.mjs: el width/height a quitar es el de la
  // etiqueta <svg> raíz y solo esa, no el de cualquier elemento del dibujo.
  return svg.replace(/^<svg\b[^>]*>/, (etiqueta) => etiqueta
    .replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
    .replace(/\s(width|height)="[^"]*"/g, ''));
}

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
const hechos = [];

function guarda(destino, datos) {
  const ruta = path.join(DESTINO, destino);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, datos);
  return ruta;
}

async function pinta(html, ancho, alto, transparente) {
  await pagina.setViewportSize({ width: ancho, height: alto });
  await pagina.setContent(html);
  return pagina.screenshot({ omitBackground: transparente });
}

for (const [destino, ancho, alto, fondo, origen, viewBox, medida] of PIEZAS) {
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  let anchoLogo = Math.round(ancho * medida.anchoLogo);
  if (medida.altoMaxLogo) anchoLogo = Math.min(anchoLogo, Math.round((alto * medida.altoMaxLogo * w) / h));
  const altoLogo = Math.round((anchoLogo * h) / w);
  const datos = await pinta(
    `<style>html,body{margin:0;height:100%}`
    + `body{display:flex;align-items:center;justify-content:center;background:${fondo}}`
    + `svg{display:block;width:${anchoLogo}px;height:${altoLogo}px}</style>`
    + prepara(fs.readFileSync(path.join(KIT, origen), 'utf8'), viewBox),
    ancho, alto, false,
  );
  const ruta = guarda(destino, datos);
  hechos.push(`${destino.padEnd(44)} ${ancho}×${alto}  ${(fs.statSync(ruta).size / 1024).toFixed(0)} KB`);
}

for (const [destino, origen, viewBox, ancho] of LOGOS) {
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  const alto = Math.round((ancho * h) / w);
  const datos = await pinta(
    `<style>html,body{margin:0;padding:0;background:transparent}`
    + `svg{display:block;width:${ancho}px;height:${alto}px}</style>`
    + prepara(fs.readFileSync(path.join(KIT, origen), 'utf8'), viewBox),
    ancho, alto, true,
  );
  const ruta = guarda(destino, datos);
  hechos.push(`${destino.padEnd(44)} ${ancho}×${alto}  ${(fs.statSync(ruta).size / 1024).toFixed(0)} KB`);
}

// El SVG se copia tal cual: es lo que hay que mandar a una imprenta o a un
// medio, donde un PNG de 2400 px se queda corto.
for (const svg of ['horizontal/tentare-horizontal-degradado.svg', 'horizontal/tentare-horizontal-blanco.svg', 'vertical/tentare-vertical-degradado.svg', 'isotipo/tentare-isotipo-degradado.svg']) {
  const datos = fs.readFileSync(path.join(KIT, svg));
  const ruta = guarda(path.join('vectorial', path.basename(svg)), datos);
  hechos.push(`vectorial/${path.basename(svg)}`.padEnd(44) + ` SVG  ${(datos.length / 1024).toFixed(0)} KB`);
}

await navegador.close();
console.log(hechos.join('\n'));
