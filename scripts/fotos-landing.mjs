// Genera las fotos de la home (AVIF + WebP) desde sus originales.
//
//   node scripts/fotos-landing.mjs [carpeta-de-originales] [--solo=cierre,plazas] [--permitir-ampliar]
//
// (Node ≥ 23.6 importa el registro `.ts` tal cual; en Node 22, añade
// `--experimental-strip-types` delante del script.)
//
// La fuente de verdad es `components/landing/fotos.ts`: qué fotos hay, su
// crédito, sus recortes (escritorio 5:4, móvil 6:5…), el punto de foco de cada
// recorte y los anchos. Este script solo obedece a ese registro:
//
//   · lee cada original de una carpeta FUERA del repo (el repo es público y los
//     originales de terceros no se versionan);
//   · comprueba que sus medidas coinciden con las del registro —si no, el
//     registro miente y se para aquí—;
//   · recorta por dirección de arte alrededor del foco, sin salirse de la foto
//     ni de sus `limites`, y aplica el `etalonado` si la foto lo lleva;
//   · escribe cada ancho en AVIF y WebP en `public/landing/fotos/`, SIN
//     metadatos (sharp no copia EXIF/XMP/ICC salvo que se le pida: ni GPS ni
//     cámara ni autor acaban en un fichero público);
//   · borra de esa carpeta lo que ya no sale del registro, para que cambiar una
//     foto no deje la anterior colgando.
//
// `--solo=` regenera solo esas claves del registro (las demás no se tocan, así
// que no cambian de bytes). La limpieza sigue contando con el registro entero.
//
// ⚠️ No amplía: si el recorte del original es más estrecho que el ancho pedido,
// falla. `--permitir-ampliar` existe solo para montar el diseño con una foto
// provisional; una foto definitiva que lo necesite es una foto que no vale.
//
// `sharp` llega instalado con Next (no se añade al package.json por esto).

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOTOS, CARPETA_PUBLICA, derivados, zonaDeRecorte } from '../components/landing/fotos.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Por defecto, la carpeta de capturas del proyecto de Claude Code de este repo
// (`~/.claude/projects/<ruta del checkout principal con «-»>/capturas/…`). Se
// deriva del checkout principal —también desde un worktree— en vez de escribir
// la ruta a mano: llevaría el usuario de la máquina a un repo público.
function originalesPorDefecto() {
  const gitComun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
  const proyecto = path.dirname(gitComun).replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(os.homedir(), '.claude/projects', proyecto, 'capturas/fotos-landing-originales');
}

const args = process.argv.slice(2);
const PERMITIR_AMPLIAR = args.includes('--permitir-ampliar');
const ORIGINALES = path.resolve(args.find((a) => !a.startsWith('--')) ?? originalesPorDefecto());
const SOLO = args.find((a) => a.startsWith('--solo='))?.slice('--solo='.length).split(',').filter(Boolean);
for (const clave of SOLO ?? []) {
  if (!(clave in FOTOS)) throw new Error(`--solo: «${clave}» no está en el registro (${Object.keys(FOTOS).join(', ')})`);
}
const SALIDA = path.join(REPO, 'public', CARPETA_PUBLICA);

// Calidades elegidas a ojo sobre fotos de estudio (piel, madera, degradados de
// luz): por debajo de esto aparecen bandas en las paredes lisas.
const AVIF = { quality: 52, effort: 6, chromaSubsampling: '4:2:0' };
const WEBP = { quality: 78, effort: 6, smartSubsample: true };

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function generar(clave, foto) {
  const origen = path.join(ORIGINALES, foto.original);
  if (!fs.existsSync(origen)) throw new Error(`[${clave}] no encuentro el original: ${origen}`);

  // `rotate()` sin argumentos aplica la orientación del EXIF: como el EXIF no se
  // copia a la salida, hay que hornear el giro antes o saldría tumbada.
  const girada = await sharp(origen).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = girada.info;
  if (width !== foto.ancho || height !== foto.alto) {
    throw new Error(`[${clave}] el registro dice ${foto.ancho}×${foto.alto} y el original mide ${width}×${height}`);
  }

  for (const d of derivados(foto)) {
    const recorte = foto.recortes[d.recorte];
    const zona = zonaDeRecorte(foto, recorte);
    if (zona.width < d.ancho && !PERMITIR_AMPLIAR) {
      throw new Error(
        `[${clave}] el recorte «${d.recorte}» mide ${zona.width} px de ancho y se pide ${d.ancho}: ` +
        'hace falta un original más grande (o --permitir-ampliar, solo para una provisional)',
      );
    }
    let img = sharp(girada.data).extract(zona).resize(d.ancho, d.alto, { fit: 'fill' });
    if (foto.etalonado) {
      // Calidez: baja azul y, en menor medida, verde (la proporción del arena).
      // Nunca sube el rojo, para que los blancos no se quemen a naranja.
      const c = foto.etalonado.calidez;
      img = img.recomb([[1, 0, 0], [0, 1 - 0.39 * c, 0], [0, 0, 1 - c]]);
      if (foto.etalonado.saturacion !== 1) img = img.modulate({ saturation: foto.etalonado.saturacion });
    }
    img = d.formato === 'avif' ? img.avif(AVIF) : img.webp(WEBP);
    const destino = path.join(SALIDA, d.fichero);
    const info = await img.toFile(destino);
    console.log(`  ${d.fichero}  ${info.width}×${info.height}  ${kb(info.size)}`);
  }
}

fs.mkdirSync(SALIDA, { recursive: true });
console.log(`Originales: ${ORIGINALES}`);
console.log(`Salida:     ${path.relative(REPO, SALIDA)}${PERMITIR_AMPLIAR ? '  (ampliando si hace falta)' : ''}`);

const esperados = new Set(Object.values(FOTOS).flatMap((foto) => derivados(foto).map((d) => d.fichero)));
for (const [clave, foto] of Object.entries(FOTOS)) {
  if (SOLO && !SOLO.includes(clave)) continue;
  console.log(`\n${clave} → ${foto.id}`);
  await generar(clave, foto);
}

// Lo que ya no sale del registro (una foto cambiada o retirada) se va.
for (const f of fs.readdirSync(SALIDA)) {
  if (/\.(avif|webp)$/.test(f) && !esperados.has(f)) {
    fs.rmSync(path.join(SALIDA, f));
    console.log(`\nBorrado (ya no está en el registro): ${f}`);
  }
}
