// Recorta el aire transparente de los logos de estudio YA subidos.
//
//   node scripts/recortar-logos-estudio.mjs                 # en seco, no toca nada
//   node scripts/recortar-logos-estudio.mjs --aplicar       # sube los recortados
//   node scripts/recortar-logos-estudio.mjs --url <url>     # una sola imagen, sin BD
//
// Desde el 2026-08-05 subirLogoEstudio() recorta al subir (lib/portal-storage.ts),
// así que esto es solo para los que ya estaban guardados con margen. Correrlo dos
// veces no hace daño: el segundo pase ve el logo ya ceñido y lo deja en paz.
//
// Necesita SUPABASE_SERVICE_ROLE_KEY salvo en modo --url: hay que leer los
// studios de TODOS los estudios y la anon key no pasa de la RLS.
//
// El recorte va con Chromium (playwright) porque el stack no tiene ninguna
// librería de imagen — mismo motivo y mismo camino que scripts/regenerar-marca.mjs.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const SOLO_URL = args[args.indexOf('--url') + 1] && args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

// Mismos valores que lib/imagen/recorte-alfa.ts. Duplicados a propósito: este
// script es .mjs suelto y no puede importar el .ts sin montar un build.
const UMBRAL_ALFA = 12;
const MARGEN_TOLERADO = 0.04;

function env(clave) {
  const f = path.join(REPO, '.env.local');
  if (process.env[clave]) return process.env[clave];
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^${clave}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

/** Mide y recorta dentro del navegador. Devuelve null si no merece la pena. */
async function medirYRecortar(pagina, url) {
  return pagina.evaluate(async ({ url, UMBRAL_ALFA, MARGEN_TOLERADO }) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => res(i); i.onerror = () => rej(new Error('no carga'));
      i.src = url;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] <= UMBRAL_ALFA) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return { lienzo: [w, h], tinta: null, merece: false };

    const caja = { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
    const merece = (1 - caja.ancho / w) > MARGEN_TOLERADO || (1 - caja.alto / h) > MARGEN_TOLERADO;
    if (!merece) return { lienzo: [w, h], tinta: [caja.ancho, caja.alto], merece: false };

    const r = document.createElement('canvas'); r.width = caja.ancho; r.height = caja.alto;
    r.getContext('2d').drawImage(c, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, caja.ancho, caja.alto);
    return { lienzo: [w, h], tinta: [caja.ancho, caja.alto], merece: true, dataUrl: r.toDataURL('image/png') };
  }, { url, UMBRAL_ALFA, MARGEN_TOLERADO });
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto('about:blank');

try {
  if (SOLO_URL) {
    const r = await medirYRecortar(pagina, SOLO_URL);
    const pct = r.tinta ? Math.round(100 * r.tinta[1] / r.lienzo[1]) : 0;
    console.log(`  lienzo ${r.lienzo.join('×')}  tinta ${r.tinta ? r.tinta.join('×') : '—'}  (${pct}% del alto)`);
    console.log(r.merece
      ? `  → recortaría a ${r.tinta.join('×')}; a height=32 el dibujo pasa de ${Math.round(32 * r.tinta[1] / r.lienzo[1])} px a 32`
      : '  → ya viene ceñido, no se tocaría');
    process.exit(0);
  }

  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const clave = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !clave) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL).');
    console.error('Es la única forma de leer los logos de todos los estudios: la anon key no pasa de la RLS.');
    process.exit(1);
  }

  const cab = { apikey: clave, Authorization: `Bearer ${clave}` };
  const estudios = await (await fetch(
    `${url}/rest/v1/studios?select=id,nombre,logo_url&logo_url=not.is.null`, { headers: cab },
  )).json();

  console.log(`${estudios.length} estudio(s) con logo${APLICAR ? '' : '  ·  EN SECO, no se toca nada'}\n`);
  let recortables = 0;

  for (const e of estudios) {
    let r;
    try { r = await medirYRecortar(pagina, e.logo_url); }
    catch { console.log(`  ✗ ${e.nombre}: no se pudo leer el logo`); continue; }

    const pct = r.tinta ? Math.round(100 * r.tinta[1] / r.lienzo[1]) : 0;
    if (!r.merece) { console.log(`  ·  ${e.nombre}: ${r.lienzo.join('×')}, ya ceñido`); continue; }
    recortables++;
    console.log(`  ⚑  ${e.nombre}: ${r.lienzo.join('×')} → ${r.tinta.join('×')} (el dibujo era el ${pct}% del alto)`);

    if (!APLICAR) continue;
    const bin = Buffer.from(r.dataUrl.split(',')[1], 'base64');
    const res = await fetch(`${url}/storage/v1/object/avatars/logo-${e.id}`, {
      method: 'POST',
      headers: { ...cab, 'content-type': 'image/png', 'x-upsert': 'true' },
      body: bin,
    });
    console.log(res.ok ? '       subido ✓' : `       ✗ al subir: ${res.status}`);
  }

  console.log(`\n${recortables} de ${estudios.length} con margen que sobra.`);
  if (recortables && !APLICAR) console.log('Vuelve a correrlo con --aplicar para recortarlos.');
} finally {
  await navegador.close();
}
