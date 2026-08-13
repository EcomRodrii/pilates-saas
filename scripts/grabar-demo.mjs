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
    // Sin paneo, y no por pereza: la tarjeta de "Primeros pasos con tu
    // estudio" (con su "todavía no has conectado Stripe") arranca en y=903 y
    // el plano mide 900 de alto, así que se queda 3 px por debajo del corte.
    // Cualquier desplazamiento la mete en cuadro — y en la portada del
    // producto que vendes, "no has conectado Stripe" cuenta que el estudio
    // está a medio montar. Esta pantalla se queda quieta; el movimiento lo
    // ponen las otras cuatro.
    async actuar(page) { await page.waitForTimeout(400); },
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
      //
      // Se busca la PRIMERA clase de la semana y se encuadra ella, en vez de
      // desplazar una fracción fija del alto. Con la fracción fija (era 0,3)
      // el plano acababa cayendo al final de la mañana: se veía una sola fila
      // de clases y debajo seis horas de tarde en blanco. Un calendario vacío
      // en la portada cuenta justo lo contrario de lo que se quiere contar, y
      // el sitio exacto donde caía dependía de si ese día había o no un aviso
      // arriba empujando la rejilla.
      await page.evaluate(() => {
        const cajas = [...document.querySelectorAll('div')].filter((d) => {
          const s = getComputedStyle(d);
          return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 40;
        });
        const grid = cajas.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!grid) return;
        // Las clases se pintan como bloques posicionados con "HH:MM" propio.
        const clases = [...grid.querySelectorAll('div')]
          .filter((d) => /^\d{2}:\d{2}\b/.test((d.innerText || '').trim()) && d.offsetHeight > 20 && d.offsetHeight < 220);
        const arriba = clases.length
          ? Math.min(...clases.map((c) => c.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop))
          : grid.scrollHeight * 0.3;
        // Aire por encima. 110 y no 40: la fila de días (LUN 10, MAR 11…) va
        // pegada arriba y con menos aire tapaba la hora de la primera clase,
        // que salía sin su "11:00".
        grid.scrollTo({ top: Math.max(0, arriba - 110), behavior: 'instant' });
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
  {
    // El plano protagonista: una instructora falla y el sistema ya trae a la
    // sustituta, con el porqué ("ya ha dado esta clase 3 veces — las alumnas
    // la conocen") y un botón de confirmar. Cierra el bucle porque es lo que
    // no hace ningún competidor.
    //
    // Para que esto se pudiera grabar hubo que cargar la disponibilidad de
    // TODAS las instructoras del estudio de demo —usando el flujo real del
    // producto, "Pedirles su disponibilidad" → enlace → rejilla → guardar—:
    // sin ese dato el motor no puede proponer a nadie y la pantalla enseñaba
    // el caso de fallo, con un botón rojo de cancelar la clase.
    //
    // La última que faltaba (Nuria Vidal) no tenía el botón en su tarjeta de
    // equipo —con la ocupación baja, la acción principal pasa a ser "Revisar
    // sus horas" (`accion()`, lib/equipo-tarjetas.ts)—, pero el propio aviso
    // ámbar de esta pantalla ofrece "Pedirles su disponibilidad" para las que
    // les falta. Con la suya cargada, el aviso desaparece y las DOS
    // sustituciones de la demo resuelven con sustituta.
    nombre: '05-sustituciones',
    ruta: '/sustituciones',
    async preparar(page) {
      await page.waitForFunction(() => document.body.innerText.includes('Sustituta ideal encontrada'), null, { timeout: 45_000 });
      await page.waitForTimeout(1500);
      // Encuadre: la tarjeta de la sustituta llena el plano. Ya no hay nada
      // que esquivar —ni aviso ámbar de "sin disponibilidad cargada" ni el
      // bloque rojo de "ninguna candidata" de la segunda sustitución—, así
      // que basta con centrarla.
      await page.evaluate(() => {
        const nodo = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /Sustituta ideal encontrada/.test(e.textContent || ''));
        if (nodo) nodo.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForTimeout(1200);
    },
    async actuar(page) { await page.waitForTimeout(400); },
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
