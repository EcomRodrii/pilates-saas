// Graba el vídeo de producto del hero a partir de la DEMO REAL (/demo →
// "Estudio Aurora", studio-demo: un estudio cien por cien ficticio que existe
// justo para esto).
//
//   npm run build && npx next start -p 3400 &
//   node scripts/grabar-demo.mjs
//
// Sale en public/producto/demo.(mp4|webm) + demo-poster.jpg.
//
// Por qué escena a escena y no una sola grabación continua: navegar entre
// pantallas dentro de una misma toma deja un fogonazo blanco en cada carga y
// obliga a cronometrar el montaje con `waitForTimeout`. Aquí cada pantalla se
// graba en su propio clip y el montaje (encadenados suaves) lo hace ffmpeg,
// que es donde se puede controlar de verdad el ritmo.
//
// De cada clip se usan solo los ÚLTIMOS `SEGUNDOS` (`-sseof`), así que todo lo
// que tarde en cargar y asentarse la pantalla se cae solo del montaje: no hace
// falta adivinar cuánto tarda cada una.
//
// ⚠️ NO se maquilla el producto: lo que se graba es la aplicación real con los
// datos de la demo. Lo único que se oculta es el lanzador flotante de soporte
// (WhatsApp), que es un widget de ayuda superpuesto —no una pantalla de
// gestión— y tapa la esquina en todas las tomas.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.DEMO_BASE ?? 'http://localhost:3400';
const TMP = '/tmp/demo-clips';
const DESTINO = path.join(process.cwd(), 'public', 'producto');
const ANCHO = 1440;
const ALTO = 900;
/** Lo que dura cada pantalla en el montaje final, antes de los encadenados. */
const SEGUNDOS = 3.0;
/** Encadenado entre pantallas. Suave, sin cortes secos. */
const FUNDIDO = 0.6;

// Ruido que no es producto: el lanzador de soporte y cualquier aviso flotante.
const OCULTAR = `
  [aria-label*="WhatsApp" i], [aria-label*="Ayuda por" i] { display: none !important; }
  [data-sonner-toaster], [role="status"] { display: none !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

/** Un desplazamiento lento y corto: da vida al plano sin marear. */
async function paneo(page, px) {
  await page.evaluate((d) => {
    const c = document.scrollingElement || document.documentElement;
    c.scrollTo({ top: d, behavior: 'smooth' });
  }, px);
}

const ESCENAS = [
  {
    nombre: '01-dashboard',
    ruta: '/dashboard',
    async preparar(page) { await page.waitForTimeout(2500); },
    // Paneo corto a propósito: más abajo está la lista de "Primeros pasos"
    // (con "todavía no has conectado Stripe"), que en un vídeo de portada
    // cuenta que el estudio está a medio montar. El plano se queda en lo que
    // sí vende: lo que necesita atención y las ventas recientes.
    async actuar(page) { await paneo(page, 80); },
  },
  {
    nombre: '02-calendario',
    ruta: '/calendario',
    async preparar(page) {
      // `networkidle` no basta: la parrilla se pinta después y, si se toca
      // antes, se graba un "Cargando…". Se espera a que ese estado
      // desaparezca — más fiable que esperar a un texto concreto, porque
      // "Reformer" también aparece en filtros y salas que están ocultos.
      await page.waitForFunction(() => !document.body.innerText.includes('Cargando'), null, { timeout: 45_000 });
      await page.waitForTimeout(1800);
      // La rejilla abre sobre la hora actual y en la demo las clases están por
      // la mañana: sin esto se graba una parrilla vacía.
      await page.evaluate(() => {
        const cajas = [...document.querySelectorAll('div')].filter((d) => {
          const s = getComputedStyle(d);
          return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 40;
        });
        const grid = cajas.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (grid) grid.scrollTo({ top: Math.max(0, grid.scrollHeight * 0.3), behavior: 'instant' });
      });
      await page.waitForTimeout(1200);
    },
    async actuar(page) { await page.waitForTimeout(400); },
  },
  {
    nombre: '03-clientas',
    ruta: '/clientas',
    async preparar(page) { await page.waitForTimeout(2500); },
    async actuar(page) { await paneo(page, 220); },
  },
  {
    nombre: '04-cobros',
    ruta: '/cobros',
    async preparar(page) { await page.waitForTimeout(2500); },
    async actuar(page) { await paneo(page, 160); },
  },
];

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(DESTINO, { recursive: true });

  const navegador = await chromium.launch();

  // La puerta de /demo inicia sesión sola; se guarda la sesión para no repetir
  // el login en cada escena (y para que no salga en ninguna toma).
  const ctxLogin = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const pLogin = await ctxLogin.newPage();
  await pLogin.goto(`${BASE}/demo`, { waitUntil: 'load', timeout: 60_000 });
  await pLogin.waitForURL(/dashboard|centro-de-control/, { timeout: 60_000 });
  await pLogin.waitForTimeout(3000);
  const sesion = await ctxLogin.storageState();
  await ctxLogin.close();

  const clips = [];
  for (const esc of ESCENAS) {
    const ctx = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      locale: 'es-ES', timezoneId: 'Europe/Madrid',
      storageState: sesion,
      recordVideo: { dir: TMP, size: { width: ANCHO, height: ALTO } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE + esc.ruta, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.addStyleTag({ content: OCULTAR });
    await esc.preparar(page);
    await esc.actuar(page);
    // Margen para que el desplazamiento suave termine dentro del clip.
    await page.waitForTimeout(SEGUNDOS * 1000 + 600);
    const video = page.video();
    await ctx.close();
    const bruto = await video.path();
    const destino = path.join(TMP, `${esc.nombre}.webm`);
    fs.renameSync(bruto, destino);
    clips.push(destino);
    console.log('grabado', esc.nombre);
  }
  await navegador.close();

  // ── Montaje ────────────────────────────────────────────────────────────────
  // De cada clip, los últimos SEGUNDOS (la pantalla ya asentada) normalizados a
  // 30 fps; luego encadenados con xfade.
  const recortes = clips.map((c, i) => {
    const out = path.join(TMP, `r${i}.mp4`);
    execFileSync('ffmpeg', ['-y', '-sseof', `-${SEGUNDOS}`, '-i', c, '-r', '30',
      '-vf', `scale=${ANCHO}:${ALTO}:flags=lanczos,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', out], { stdio: 'ignore' });
    return out;
  });

  const entradas = recortes.flatMap((r) => ['-i', r]);
  let filtro = '';
  let etiqueta = '[0:v]';
  for (let i = 1; i < recortes.length; i++) {
    const off = (SEGUNDOS - FUNDIDO) * i - (FUNDIDO * 0) ;
    const sig = `[x${i}]`;
    filtro += `${etiqueta}[${i}:v]xfade=transition=fade:duration=${FUNDIDO}:offset=${(off).toFixed(2)}${sig};`;
    etiqueta = sig;
  }
  filtro = filtro.replace(/;$/, '');

  const mp4 = path.join(DESTINO, 'demo.mp4');
  execFileSync('ffmpeg', ['-y', ...entradas, '-filter_complex', filtro, '-map', etiqueta,
    '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });

  const webm = path.join(DESTINO, 'demo.webm');
  execFileSync('ffmpeg', ['-y', '-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0',
    '-row-mt', '1', '-an', webm], { stdio: 'ignore' });

  // Póster: primer fotograma, para que no se vea un hueco mientras carga.
  execFileSync('ffmpeg', ['-y', '-i', mp4, '-vframes', '1', '-q:v', '4',
    path.join(DESTINO, 'demo-poster.jpg')], { stdio: 'ignore' });

  for (const f of ['demo.mp4', 'demo.webm', 'demo-poster.jpg']) {
    const s = fs.statSync(path.join(DESTINO, f));
    console.log(f, (s.size / 1024).toFixed(0) + ' KB');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
