// Genera las portadas de /recursos (AVIF + WebP) desde sus originales.
//
//   node scripts/portadas-recursos.mjs [carpeta-de-originales]
//
// (Node ≥ 23.6 importa el registro `.ts` tal cual; en Node 22, añade
// `--experimental-strip-types` delante del script.)
//
// Hermano de scripts/fotos-landing.mjs, con las mismas reglas y sin su dirección
// de arte (una portada se pinta entera):
//   · la fuente de verdad es lib/recursos/guias.ts (portadas, anchos, formatos);
//   · los originales se leen de una carpeta FUERA del repo, que es público;
//   · se comprueban sus medidas contra el registro, y si no cuadran se para;
//   · se quita el filete blanco de recorte de pantalla que dice `recorte`, y si
//     aún queda un borde así, se para;
//   · NUNCA amplía: un ancho mayor que el original es un error;
//   · escribe sin metadatos (sharp no copia EXIF/XMP/ICC salvo que se le pida);
//   · borra de public/recursos/portadas lo que ya no está en el registro.
//
// `sharp` llega instalado con Next (no se añade al package.json por esto).

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARPETA_PORTADAS, altoUtil, anchoUtil, derivadosPortada, todasLasPortadas } from '../lib/recursos/guias.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Por defecto, la carpeta de capturas del proyecto de Claude Code de este repo.
// Se deriva del checkout principal (también desde un worktree) en vez de
// escribirla a mano: llevaría el usuario de la máquina a un repo público.
function originalesPorDefecto() {
  const gitComun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
  const proyecto = path.dirname(gitComun).replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(os.homedir(), '.claude/projects', proyecto, 'capturas/blog-imagenes-originales');
}

const ORIGINALES = path.resolve(process.argv[2] ?? originalesPorDefecto());
const SALIDA = path.join(REPO, 'public', CARPETA_PORTADAS);

// Más calidad que las fotos de la landing (52/78): estas portadas son pequeñas y
// llevan pantallas con texto, que a 52 se emborronaba. Aun así, unos 10 KB.
const AVIF = { quality: 64, effort: 6, chromaSubsampling: '4:2:0' };
const WEBP = { quality: 84, effort: 6, smartSubsample: true };

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// Un filete de recorte de pantalla son 1-4 líneas de borde casi blancas que no
// se parecen a la foto que tienen 5 px más adentro (o una sola línea que salta
// de golpe respecto a la de al lado). Si queda alguno tras aplicar `recorte`, se
// para: en la tarjeta se vería como una raya clara pegada a la foto.
async function comprobarBordes(id, buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x, y, c) => data[(y * W + x) * 3 + c];
  // Punto i de la línea a `d` px del borde.
  const lados = {
    arriba: [W, (i, d) => [i, d]],
    abajo: [W, (i, d) => [i, H - 1 - d]],
    izquierda: [H, (i, d) => [d, i]],
    derecha: [H, (i, d) => [W - 1 - d, i]],
  };
  for (const [lado, [n, punto]] of Object.entries(lados)) {
    let luz = 0;
    let junto = 0;
    let dentro = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const borde = px(...punto(i, 0), c);
        luz += borde;
        junto += Math.abs(borde - px(...punto(i, 1), c));
        dentro += Math.abs(borde - px(...punto(i, 5), c));
      }
    }
    [luz, junto, dentro] = [luz, junto, dentro].map((v) => v / n / 3);
    if ((luz >= 235 && dentro >= 30) || junto >= 60) {
      throw new Error(`[${id}] queda un filete ${lado} (luz ${luz.toFixed(0)}, salto ${junto.toFixed(0)}/${dentro.toFixed(0)}): ajusta su recorte`);
    }
  }
}

fs.mkdirSync(SALIDA, { recursive: true });
console.log(`Originales: ${ORIGINALES}`);
console.log(`Salida:     ${path.relative(REPO, SALIDA)}`);

const esperados = new Set();
for (const portada of todasLasPortadas()) {
  const origen = path.join(ORIGINALES, portada.original);
  if (!fs.existsSync(origen)) throw new Error(`[${portada.id}] no encuentro el original: ${origen}`);
  const girada = await sharp(origen).rotate().toBuffer({ resolveWithObject: true });
  if (girada.info.width !== portada.ancho || girada.info.height !== portada.alto) {
    throw new Error(`[${portada.id}] el registro dice ${portada.ancho}×${portada.alto} y el original mide ${girada.info.width}×${girada.info.height}`);
  }
  // [arriba, derecha, abajo, izquierda]: derecha y abajo ya van restadas en anchoUtil/altoUtil.
  const [arriba, , , izquierda] = portada.recorte;
  const width = anchoUtil(portada);
  const height = altoUtil(portada);
  const recortada = await sharp(girada.data)
    .extract({ left: izquierda, top: arriba, width, height })
    .toBuffer();
  await comprobarBordes(portada.id, recortada);
  console.log(`\n${portada.id}  (${portada.ancho}×${portada.alto} → ${width}×${height} sin filete)`);
  for (const d of derivadosPortada(portada)) {
    if (d.ancho > width) throw new Error(`[${portada.id}] se pide ${d.ancho} px y el original útil mide ${width}: no se amplía`);
    let img = sharp(recortada).resize(d.ancho, d.alto, { fit: 'fill' });
    img = d.formato === 'avif' ? img.avif(AVIF) : img.webp(WEBP);
    const info = await img.toFile(path.join(SALIDA, d.fichero));
    esperados.add(d.fichero);
    console.log(`  ${d.fichero}  ${info.width}×${info.height}  ${kb(info.size)}`);
  }
}

for (const f of fs.readdirSync(SALIDA)) {
  if (/\.(avif|webp)$/.test(f) && !esperados.has(f)) {
    fs.rmSync(path.join(SALIDA, f));
    console.log(`\nBorrado (ya no está en el registro): ${f}`);
  }
}
