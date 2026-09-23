#!/usr/bin/env node
// Descarga UNA VEZ los woff2 de Google Fonts que usa `app/_fuentes/fuentes.ts`
// y los deja en `app/_fuentes/<familia>/`, con su licencia OFL al lado.
//
// Por qué existe: `next/font/google` pedía el CSS a fonts.googleapis.com en
// CADA build, y Google a veces contesta con URLs sin extensión
// (`fonts.gstatic.com/l/font?kit=…&skey=…`) que el cargador de Next no sabe
// leer — el build fallaba al azar (vercel/next.js#99114, 23-sep-2026). Con los
// ficheros en el repo el build ya no depende de la red.
//
// Solo se usa para añadir un peso o una familia: `node scripts/descargar-fuentes.mjs`
// y luego añadir a mano la entrada en `app/_fuentes/fuentes.ts` (next/font exige
// literales en la llamada, no se puede generar).
//
// Se guardan `latin` y `latin-ext`: la eñe y los acentos viven en `latin`, pero
// nombres como Ștefan o Łukasz necesitan `latin-ext`, que antes llegaba solo
// por `unicode-range`. El resto de subconjuntos (cirílico, vietnamita,
// devanagari) se quedan fuera: el producto es en español.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '_fuentes');
// El mismo que manda `next/font/google`: decide que Google sirva woff2.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';
const SUBCONJUNTOS = ['latin', 'latin-ext'];

// dir = carpeta de destino y de la licencia en github.com/google/fonts (ofl/<dir>).
const FAMILIAS = [
  { familia: 'Plus Jakarta Sans', dir: 'plusjakartasans', pesos: [400, 500, 600, 700, 800] },
  { familia: 'IBM Plex Mono', dir: 'ibmplexmono', pesos: [400, 500] },
  { familia: 'Instrument Serif', dir: 'instrumentserif', pesos: [400], cursiva: true },
  { familia: 'Instrument Sans', dir: 'instrumentsans', pesos: [400, 500, 600, 700] },
  { familia: 'Outfit', dir: 'outfit', pesos: [400, 500, 600, 700] },
  { familia: 'Poppins', dir: 'poppins', pesos: [400, 500, 600, 700] },
  { familia: 'Cormorant Garamond', dir: 'cormorantgaramond', pesos: [400, 500, 600], cursiva: true },
  { familia: 'Sacramento', dir: 'sacramento', pesos: [400] },
  { familia: 'Libre Caslon Text', dir: 'librecaslontext', pesos: [400, 700], cursiva: true },
  { familia: 'Figtree', dir: 'figtree', pesos: [300, 400, 500, 600, 700] },
];

function urlCss({ familia, pesos, cursiva }) {
  const nombre = familia.replaceAll(' ', '+');
  const ejes = cursiva
    ? `ital,wght@${[0, 1].flatMap((i) => pesos.map((p) => `${i},${p}`)).join(';')}`
    : `wght@${pesos.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${nombre}:${ejes}&display=swap`;
}

// Reintenta mientras Google conteste con URLs `/l/font?kit=` — justo la forma
// que rompía el build — hasta que dé las `/s/…/*.woff2` de siempre.
async function pedirCss(url) {
  for (let intento = 1; intento <= 10; intento++) {
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    if (!css.includes('@font-face')) throw new Error(`Google no devolvió @font-face para ${url}`);
    if (!css.includes('gstatic.com/l/')) return css;
  }
  throw new Error(`Google insiste en URLs /l/font para ${url}`);
}

function caras(css) {
  const re = /\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]*)\}/g;
  return [...css.matchAll(re)].map(([, subconjunto, cuerpo]) => ({
    subconjunto,
    estilo: /font-style: (\w+)/.exec(cuerpo)[1],
    peso: /font-weight: (\d+)/.exec(cuerpo)[1],
    url: /src: url\(([^)]+)\)/.exec(cuerpo)[1],
    rango: /unicode-range: ([^;]+);/.exec(cuerpo)[1],
  }));
}

for (const f of FAMILIAS) {
  const destino = join(RAIZ, f.dir);
  await mkdir(destino, { recursive: true });
  const elegidas = caras(await pedirCss(urlCss(f))).filter((c) => SUBCONJUNTOS.includes(c.subconjunto));
  // Una fuente variable sirve el MISMO fichero para todos los pesos: se
  // descarga una vez y se nombra sin peso.
  const pesosPorUrl = new Map();
  for (const c of elegidas) pesosPorUrl.set(c.url, (pesosPorUrl.get(c.url) ?? 0) + 1);
  const nombres = new Map();
  for (const c of elegidas) {
    if (nombres.has(c.url)) continue;
    const peso = pesosPorUrl.get(c.url) > 1 ? '' : `-${c.peso}`;
    const cursiva = c.estilo === 'italic' ? '-italic' : '';
    const nombre = `${f.dir}-${c.subconjunto}${peso}${cursiva}.woff2`;
    const bytes = Buffer.from(await (await fetch(c.url)).arrayBuffer());
    if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${c.url} no es woff2`);
    await writeFile(join(destino, nombre), bytes);
    nombres.set(c.url, nombre);
  }
  for (const c of elegidas) console.log(`${f.familia} | ${c.subconjunto} | ${c.peso} ${c.estilo} | ${f.dir}/${nombres.get(c.url)}`);

  const licencia = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${f.dir}/OFL.txt`);
  if (!licencia.ok) throw new Error(`Sin OFL.txt para ${f.familia} (${licencia.status})`);
  await writeFile(join(destino, 'OFL.txt'), await licencia.text());
}

// Los `unicode-range` de los dos subconjuntos, para copiarlos a fuentes.ts.
const css = await pedirCss(urlCss(FAMILIAS[0]));
for (const s of SUBCONJUNTOS) console.log(`${s}: ${caras(css).find((c) => c.subconjunto === s).rango}`);
