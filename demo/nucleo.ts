import { chromium, type Browser, type Locator, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { montarBackend, type Backend, type Tablas } from './backend.ts';
import { montarApi } from './api.ts';
import { montar, ir } from '../e2e/panel-sembrado.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El grabador de la demo. Un capítulo = un contexto de Playwright = un vídeo.
//
//  · `dice(texto)`        narra (voz + rótulo) y espera a que termine de hablar.
//  · `mientras(t, fn)`    narra mientras `fn` hace lo que se cuenta; acaba cuando
//                         han acabado las dos cosas.
//  · `momento(tarjeta)`   apunta el minuto en que empieza a hablarse de un ajuste
//                         (alimenta el índice del apartado «Demo»).
//
// La voz sale de `say` (voz Mónica de macOS) y se mezcla con el vídeo en
// `demo/montar.mjs`: aquí solo se apunta CUÁNDO empieza cada frase. Cada texto se
// sintetiza una vez y se guarda en `demo/salida/voz/`: grabar de nuevo un capítulo
// no vuelve a llamar a `say`.
//
// Con `DEMO_RAPIDO=1` no se espera a que la voz termine ni se graba vídeo: sirve
// para comprobar que los selectores del guion siguen acertando (y para sintetizar
// todas las frases antes de la grabación de verdad, que va en tiempo real).
// ─────────────────────────────────────────────────────────────────────────────

export const RAIZ = resolve(import.meta.dirname, '..');
export const SALIDA = join(RAIZ, 'demo/salida');
const VOZ = join(SALIDA, 'voz');
export const RAPIDO = process.env.DEMO_RAPIDO === '1';

const VOZ_NOMBRE = process.env.DEMO_VOZ ?? 'Mónica';
const VOZ_PALABRAS_MINUTO = process.env.DEMO_VOZ_RITMO ?? '168';

// La voz buena es ElevenLabs (la de macOS suena a robot: el fundador la descartó). Se usa en
// cuanto hay clave en `ELEVENLABS_API_KEY`; sin ella, `say` (solo sirve para probar el guion).
// Modelo multilingüe y voz fijados aquí: cambiar de voz regenera todas las frases.
const ELEVEN_CLAVE = process.env.ELEVENLABS_API_KEY ?? '';
const ELEVEN_VOZ = process.env.DEMO_VOZ_ELEVEN ?? '1CeqBeXMOqCleeQjfYfO';
const ELEVEN_MODELO = process.env.DEMO_ELEVEN_MODELO ?? 'eleven_multilingual_v2';
export const USA_ELEVEN = ELEVEN_CLAVE !== '' && process.env.DEMO_VOZ_MAC !== '1';

export const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface Voz { archivo: string; durMs: number }

/** Una frase con ElevenLabs → mp3. La clave va por stdin de curl: nunca en los argumentos (`ps`). */
function sintetizarEleven(texto: string, mp3: string) {
  const cuerpo = JSON.stringify({
    text: texto,
    model_id: ELEVEN_MODELO,
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
  });
  for (let intento = 1; ; intento++) {
    try {
      execFileSync('curl', [
        '-sS', '-f', '-X', 'POST', `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOZ}?output_format=mp3_44100_128`,
        '-H', 'Content-Type: application/json', '-K', '-', '-d', cuerpo, '-o', mp3,
      ], { input: `header = "xi-api-key: ${ELEVEN_CLAVE}"\n`, stdio: ['pipe', 'inherit', 'inherit'] });
      return;
    } catch (e) {
      // 429 (demasiadas a la vez) y fallos de red: se reintenta; un 401/402/422 no se arregla esperando.
      if (intento >= 4) throw new Error(`ElevenLabs no contesta bien tras ${intento} intentos: ${String((e as Error).message).split('\n')[0]}`);
      execFileSync('sleep', [String(intento * 2)]);
    }
  }
}

/** Sintetiza un texto (o lo reutiliza si ya se hizo) y dice cuánto dura. */
export function sintetizar(texto: string): Voz {
  mkdirSync(VOZ, { recursive: true });
  const motor = USA_ELEVEN ? `eleven|${ELEVEN_VOZ}|${ELEVEN_MODELO}` : `mac|${VOZ_NOMBRE}|${VOZ_PALABRAS_MINUTO}`;
  const hash = createHash('sha1').update(`${motor}|${texto}`).digest('hex').slice(0, 16);
  const wav = join(VOZ, `${hash}.wav`);
  const meta = join(VOZ, `${hash}.json`);
  if (existsSync(wav) && existsSync(meta)) return JSON.parse(readFileSync(meta, 'utf8')) as Voz;
  const crudo = join(VOZ, USA_ELEVEN ? `${hash}.mp3` : `${hash}.aiff`);
  if (USA_ELEVEN) sintetizarEleven(texto, crudo);
  else execFileSync('say', ['-v', VOZ_NOMBRE, '-r', VOZ_PALABRAS_MINUTO, '-o', crudo, texto]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', crudo, '-ar', '44100', '-ac', '1', wav]);
  rmSync(crudo, { force: true });
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString().trim());
  const voz: Voz = { archivo: wav, durMs: Math.round(dur * 1000) };
  writeFileSync(meta, JSON.stringify(voz));
  return voz;
}

export interface EventoVoz { inicioMs: number; durMs: number; archivo: string; texto: string }
export interface Momento { tarjeta: string; ms: number }
export interface Cronologia {
  capitulo: string;
  /** Posición del capítulo en la demo (1…14). */
  numero: number;
  /** Cuántos ms pasan entre que arranca el vídeo (la página se crea) y el primer instante del guion. */
  inicioGuionMs: number;
  titulo: string;
  video: string | null;
  voces: EventoVoz[];
  momentos: Momento[];
  duracionMs: number;
}

// Se inyecta en CADA documento: el rótulo, el cursor y el anillo del clic. Vive en
// el DOM de la página (no en el vídeo ya grabado) para que se vea igual en todas
// las pantallas. `pointer-events: none` en todo: nunca estorba a un clic.
const SCRIPT_PÁGINA = `(() => {
  if (window.__demo || window.top !== window) return; // solo en la página, nunca dentro de la vista previa del móvil
  const css = document.createElement('style');
  css.textContent = \`
    #demo-rotulo{position:fixed;left:16px;top:12px;z-index:2147483646;width:min(960px,calc(100vw - 480px));pointer-events:none;
      font:500 21px/1.38 "Plus Jakarta Sans",system-ui,sans-serif;color:#fff;background:rgba(18,20,12,.88);border-radius:16px;
      padding:14px 20px 15px;box-shadow:0 8px 30px rgba(0,0,0,.28);opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s}
    #demo-rotulo.on{opacity:1;transform:none}
    #demo-rotulo small{display:block;font:600 12px/1 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#d9c29e;margin-bottom:7px}
    #demo-titulo{position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;
      text-align:center;background:rgba(18,20,12,.93);color:#fff;opacity:0;transition:opacity .45s;padding:0 15%}
    #demo-titulo.on{opacity:1}
    #demo-titulo small{font:600 16px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d9c29e;margin-bottom:22px}
    #demo-titulo h1{font:700 56px/1.1 "Plus Jakarta Sans",system-ui,sans-serif;margin:0 0 22px}
    #demo-titulo p{font:400 24px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;color:#e7e1d3;margin:0;max-width:980px}
    #demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-3px 0 0 -3px;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:transform .06s}
    .demo-anillo{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
      border:3px solid #e8a33d;animation:demo-anillo .55s ease-out forwards}
    @keyframes demo-anillo{to{transform:scale(3.2);opacity:0}}\`;
  const rot = document.createElement('div'); rot.id = 'demo-rotulo';
  const tit = document.createElement('div'); tit.id = 'demo-titulo';
  const cur = document.createElement('div'); cur.id = 'demo-cursor';
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.7-7.8L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  // El documento puede no tener <html> todavía (esto corre antes de que se analice):
  // se monta cuando esté, y se vuelve a montar si el framework lo arranca al hidratar.
  const montar = () => {
    const raiz = document.documentElement;
    if (!raiz) return;
    [css, rot, tit, cur].forEach(e => { if (e.parentNode !== raiz) raiz.appendChild(e); });
  };
  montar();
  document.addEventListener('DOMContentLoaded', montar);
  // El rótulo se aparta del cajón abierto: los hay de 450 px y de 710, y tapar su título es tapar lo que se cuenta.
  const ajustar = () => {
    let borde = innerWidth;
    document.querySelectorAll('[role=dialog]').forEach(d => {
      const r = d.getBoundingClientRect();
      if (r.width > 200 && r.width < innerWidth * 0.8 && r.left > 300 && r.left < borde) borde = r.left;
    });
    rot.style.width = Math.max(420, Math.min(960, borde - 32)) + 'px';
  };
  setInterval(() => { montar(); ajustar(); }, 200);
  let ultimo = null;
  try { ultimo = JSON.parse(sessionStorage.getItem('__demo_rotulo') || 'null'); } catch {}
  window.__demo = {
    rotulo(seccion, texto) {
      rot.innerHTML = '<small></small><span></span>';
      rot.firstChild.textContent = seccion; rot.lastChild.textContent = texto;
      rot.classList.add('on');
      try { sessionStorage.setItem('__demo_rotulo', JSON.stringify({ seccion, texto })); } catch {}
    },
    quitar() { rot.classList.remove('on'); try { sessionStorage.removeItem('__demo_rotulo'); } catch {} },
    titulo(num, nombre, frase) {
      tit.innerHTML = '<small></small><h1></h1><p></p>';
      tit.children[0].textContent = num; tit.children[1].textContent = nombre; tit.children[2].textContent = frase;
      tit.classList.add('on');
    },
    quitarTitulo() { tit.classList.remove('on'); },
  };
  if (ultimo) window.__demo.rotulo(ultimo.seccion, ultimo.texto);
  addEventListener('mousemove', e => { cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  addEventListener('mousedown', e => {
    const a = document.createElement('div'); a.className = 'demo-anillo';
    a.style.left = e.clientX + 'px'; a.style.top = e.clientY + 'px';
    document.documentElement.appendChild(a); setTimeout(() => a.remove(), 700);
  }, true);
})();`;

async function logoAurora(navegador: Browser): Promise<Buffer> {
  const p = await navegador.newPage({ viewport: { width: 480, height: 480 } });
  await p.setContent(`<body style="margin:0;background:transparent"><svg width="480" height="480" viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2B368"/><stop offset="1" stop-color="#C97B2E"/></linearGradient></defs>
    <circle cx="240" cy="240" r="220" fill="url(#a)"/>
    <path d="M60 300 Q240 190 420 300" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
    <path d="M110 345 Q240 265 370 345" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".8"/>
    <circle cx="240" cy="200" r="38" fill="#fff"/></svg></body>`);
  const png = await p.screenshot({ omitBackground: true, type: 'png' });
  await p.close();
  return png;
}

export class Grabador {
  readonly voces: EventoVoz[] = [];
  readonly momentos: Momento[] = [];
  private t0 = Date.now();
  private seccionRotulo = '';
  private nFoto = 0;

  readonly page: Page;
  readonly contexto: BrowserContext;
  readonly backend: Backend;
  readonly id: string;
  readonly titulo: string;

  constructor(page: Page, contexto: BrowserContext, backend: Backend, id: string, titulo: string) {
    this.page = page;
    this.contexto = contexto;
    this.backend = backend;
    this.id = id;
    this.titulo = titulo;
  }

  /** ms desde que arrancó el vídeo de este capítulo. */
  ahora() { return Date.now() - this.t0; }
  reloj() { this.t0 = Date.now(); }

  /** Cabecera del rótulo: «Mi estudio · Nombre y dirección». */
  seccion(texto: string) { this.seccionRotulo = texto; }

  private async rotular(texto: string) {
    await this.page.evaluate(([s, t]) => (window as unknown as { __demo?: { rotulo(a: string, b: string): void } }).__demo?.rotulo(s, t), [this.seccionRotulo, texto] as const).catch(() => {});
  }

  async quitarRotulo() {
    await this.page.evaluate(() => (window as unknown as { __demo?: { quitar(): void } }).__demo?.quitar()).catch(() => {});
  }

  /** Narra y espera a que termine. */
  async dice(texto: string, holgura = 450) {
    await this.mientras(texto, async () => {}, holgura);
  }

  /** Narra mientras se hace lo que se cuenta: acaba cuando han acabado las dos cosas. */
  async mientras<T>(texto: string, fn: () => Promise<T>, holgura = 450): Promise<T> {
    if (texto.length > 270) console.warn(`  ⚠ frase larga (${texto.length}): ${texto.slice(0, 50)}…`);
    const voz = sintetizar(texto);
    await this.rotular(texto);
    this.voces.push({ inicioMs: this.ahora(), durMs: voz.durMs, archivo: voz.archivo, texto });
    const espera = RAPIDO ? Promise.resolve() : dormir(voz.durMs + holgura);
    const [res] = await Promise.all([fn(), espera]);
    if (process.env.DEMO_FOTOS === '1') {
      const dir = join(SALIDA, 'fotos', this.id);
      mkdirSync(dir, { recursive: true });
      await this.page.screenshot({ path: join(dir, `${String(++this.nFoto).padStart(2, '0')}.png`) }).catch(() => {});
    }
    return res;
  }

  momento(tarjeta: string) { this.momentos.push({ tarjeta, ms: this.ahora() }); }

  /** La pantalla de título de un capítulo, con su frase narrada. */
  async portada(num: string, nombre: string, frase: string, narracion = frase) {
    await this.page.evaluate(([n, t, f]) => (window as unknown as { __demo: { titulo(a: string, b: string, c: string): void } }).__demo.titulo(n, t, f), [num, nombre, frase] as const);
    await this.quitarRotulo();
    const voz = sintetizar(narracion);
    this.voces.push({ inicioMs: this.ahora() + 500, durMs: voz.durMs, archivo: voz.archivo, texto: narracion });
    if (!RAPIDO) await dormir(500 + voz.durMs + 600);
    await this.page.evaluate(() => (window as unknown as { __demo: { quitarTitulo(): void } }).__demo.quitarTitulo());
    if (!RAPIDO) await dormir(600);
  }

  async pausa(ms: number) { if (!RAPIDO) await dormir(ms); }

  // ── Manos ──────────────────────────────────────────────────────────────────

  /** Lleva el cursor hasta el centro del elemento, con calma, y lo deja ahí. */
  async ir(l: Locator) {
    await l.scrollIntoViewIfNeeded();
    const caja = await l.boundingBox();
    if (!caja) return;
    await this.page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: RAPIDO ? 1 : 28 });
    await this.pausa(280);
  }

  async clic(l: Locator) {
    await this.ir(l);
    await l.click();
    await this.pausa(380);
  }

  /** Vacía el campo y escribe despacio, como lo haría una persona. */
  async escribe(l: Locator, texto: string) {
    await this.ir(l);
    await l.click();
    // Las fechas y las horas no se escriben tecla a tecla: se rellenan de una vez.
    const tipo = await l.getAttribute('type');
    if (tipo === 'date' || tipo === 'time' || tipo === 'color') {
      await l.fill(texto);
    } else {
      // Seleccionar y teclear encima, como una persona: con `fill('')` un campo numérico
      // se queda en «0» y lo escrito sale «012».
      await this.page.keyboard.press('ControlOrMeta+a');
      await l.pressSequentially(texto, { delay: RAPIDO ? 0 : 55 });
    }
    await this.pausa(300);
  }

  async elige(l: Locator, valor: string) {
    await this.ir(l);
    await l.selectOption(valor);
    await this.pausa(350);
  }

  /** Abre una pantalla del panel (con todo el andamiaje de espera del e2e). */
  async visita(ruta: string) {
    await ir(this.page, ruta);
  }

  /** El «Guardar» del cajón abierto. */
  async guarda(nombre = 'Guardar') {
    const b = this.page.getByRole('button', { name: nombre, exact: true });
    await this.clic(b);
    await this.pausa(900);
  }

  numero = 0;
  inicioGuionMs = 0;

  cronologia(video: string | null): Cronologia {
    return { capitulo: this.id, numero: this.numero, inicioGuionMs: this.inicioGuionMs, titulo: this.titulo, video, voces: this.voces, momentos: this.momentos, duracionMs: this.ahora() };
  }
}

interface Captura { arrancar(): void; terminar(salida: string, duracionMs: number): Promise<string> }

/** Captura de pantalla de calidad: cada fotograma del navegador, en JPEG al 100 %, con su instante. */
async function iniciarCaptura(contexto: BrowserContext, page: Page, dir: string): Promise<Captura> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await contexto.newCDPSession(page);
  const marcas: { ms: number; archivo: string }[] = [];
  let t0 = 0;
  cdp.on('Page.screencastFrame', ev => {
    void cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    if (t0 === 0) return;
    const archivo = join(dir, `${String(marcas.length).padStart(6, '0')}.jpg`);
    writeFileSync(archivo, Buffer.from(ev.data, 'base64'));
    marcas.push({ ms: Date.now() - t0, archivo });
  });
  return {
    arrancar() {
      t0 = Date.now();
      void cdp.send('Page.startScreencast', { format: 'jpeg', quality: 100, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    },
    async terminar(salida, duracionMs) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      if (marcas.length === 0) throw new Error('la captura no recogió ni un fotograma');
      // El primero vale desde el instante 0 (todavía no había pintado nada que enseñar antes).
      const lista: string[] = [];
      marcas.forEach((m, i) => {
        const hasta = i + 1 < marcas.length ? marcas[i + 1].ms : Math.max(duracionMs, m.ms + 40);
        const desde = i === 0 ? 0 : m.ms;
        lista.push(`file '${m.archivo}'`, `duration ${Math.max((hasta - desde) / 1000, 0.001).toFixed(3)}`);
      });
      lista.push(`file '${marcas[marcas.length - 1].archivo}'`);
      const archivoLista = join(dir, 'lista.txt');
      writeFileSync(archivoLista, lista.join('\n'));
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', archivoLista,
        '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-g', '250', '-movflags', '+faststart', salida,
      ]);
      rmSync(dir, { recursive: true, force: true });
      return salida;
    },
  };
}

export interface OpcionesCapitulo {
  id: string;
  titulo: string;
  /** Tablas del estudio de demo (compartidas entre capítulos: lo que se guarda en uno se ve en el siguiente). */
  tablas: Tablas;
  numero: number;
}

/** Abre un capítulo con su propio vídeo, lo ejecuta y deja el vídeo y su cronología en `demo/salida/`. */
export async function grabarCapitulo(
  opciones: OpcionesCapitulo,
  guion: (g: Grabador) => Promise<void>,
  baseURL: string,
): Promise<Cronologia> {
  const dirVideo = join(SALIDA, 'video', opciones.id);
  mkdirSync(dirVideo, { recursive: true });
  const dirFotogramas = join(SALIDA, 'fotogramas', opciones.id);
  const navegador = await chromium.launch({ args: ['--lang=es-ES'] });
  const contexto = await navegador.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await contexto.newPage();
  const paginaCreada = Date.now();
  await contexto.addInitScript(SCRIPT_PÁGINA);
  const g0 = Date.now();
  await montar(page);
  // El logo del estudio de ejemplo: un sol naciente dibujado aquí mismo, servido a la
  // pantalla como si fuera una imagen alojada en cualquier sitio.
  const logo = await logoAurora(navegador);
  await page.route('**/logo-aurora.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  const backend = await montarBackend(page, opciones.tablas);
  await montarApi(page, backend);
  // La vista previa del móvil (Apariencia) es la app REAL de la alumna dentro de un
  // iframe, y el servidor de pruebas la pinta siempre con el estudio de e2e («Tentare»).
  // Aquí se le pone el nombre del estudio de ejemplo para que el vídeo no mezcle dos.
  await page.route(u => u.pathname.startsWith('/portal/') || u.pathname.startsWith('/portal-preview/'), async route => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const respuesta = await route.fetch();
    if (!(respuesta.headers()['content-type'] ?? '').includes('text/html')) return route.fulfill({ response: respuesta });
    const cuerpo = (await respuesta.text()).replaceAll('Tentare', 'Estudio Aurora');
    const cabeceras = { ...respuesta.headers() };
    delete cabeceras['content-length'];
    delete cabeceras['content-encoding'];
    return route.fulfill({ response: respuesta, body: cuerpo, headers: cabeceras });
  });
  const g = new Grabador(page, contexto, backend, opciones.id, opciones.titulo);
  let error: unknown = null;
  // La captura es PROPIA y no `recordVideo` de Playwright: este va a ~0,6 Mbps en VP8 y el texto
  // sale borroso. Aquí cada fotograma que pinta el navegador se guarda en JPEG al 100 % y se
  // codifica después, así el texto se lee. El reloj del vídeo ES el del guion (`g.reloj()`).
  const captura = RAPIDO ? null : await iniciarCaptura(contexto, page, dirFotogramas);
  try {
    g.reloj();
    captura?.arrancar();
    g.numero = opciones.numero;
    g.inicioGuionMs = 0;
    void g0;
    void paginaCreada;
    await guion(g);
  } catch (e) {
    error = e;
    await page.screenshot({ path: join(SALIDA, `fallo-${opciones.id}.png`) }).catch(() => {});
  }
  const crono = g.cronologia(null);
  let ruta: string | null = null;
  if (captura) ruta = await captura.terminar(join(dirVideo, `${opciones.id}.mp4`), crono.duracionMs);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await contexto.close();
  await navegador.close();
  const final: Cronologia = { ...crono, video: ruta };
  if (!RAPIDO && opciones.numero > 0) writeFileSync(join(SALIDA, `cronologia-${opciones.id}.json`), JSON.stringify(final, null, 1));
  if (error) throw error;
  return final;
}
