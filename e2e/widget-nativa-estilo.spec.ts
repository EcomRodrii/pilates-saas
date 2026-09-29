import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor } from '../lib/widgets/config.ts';
import { generarCodigo, firmaContenidoDe, type EntradaIntegracion } from '../lib/widgets/integracion.ts';
import { firmaDeUrl } from '../lib/widgets/firma-contenido.ts';
import { fuenteDeDataset } from '../lib/reservar/config-widget.ts';
import { WIDGET_WEB_NEUTRO, type WidgetWeb } from '../lib/reservar/estilo-web-tipos.ts';
import { baseEstiloWeb } from '../lib/reservar/estilo-web.ts';
import { datosEstiloNativaDeBase, estiloDeLaNativa, leerDatosEstiloNativa, type EstiloNativa } from '../lib/widget/estilo-nativa.ts';
import { HOJA_FUENTES_NATIVA, RUTA_FUENTES_NATIVA } from '../lib/widget/fuentes-nativa.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fase E del constructor de widgets: la integración SIN MARCO sigue el estilo
// de los widgets de su web, y dice qué versión de su código tiene pegada.
//
// El estilo viaja en los DATOS (`estiloWidget` de /api/public/studio-data), no
// en el código: un código pegado hace tiempo lo toma sin volver a pegarlo. Aquí
// se mira en una web de verdad, con el bundle REAL compilado:
//   · sin nada elegido, la nativa se ve como siempre, con el color del TEMA;
//   · con un estilo, sus tokens, su recuadro o su fundido;
//   · con «Como tu app», la letra de su web y ni una petición de fuentes; con
//     una letra elegida, la hoja de Tentare, una sola vez por página;
//   · un diseño propio en sus atributos gana, y ni siquiera se pide el estilo;
//   · `widget_loaded` lleva la firma de sus `data-*`, la misma que el panel.
//
// Todo en orígenes ficticios `http` servidos con `page.route`, como la Fase D:
// ni localhost ni la bandera de Local Network Access. Los valores esperados
// salen de `estiloDeLaNativa`, no escritos a mano.
//
// ⚠️ `public/widget.js` y `public/widget-fuentes/` no están en git: los genera
// `npm run build:widget` (en CI, dentro de `npm run build`, y viajan en el
// artefacto a los shards). En local hay que generarlos antes.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(90_000);

const TENTARE = 'http://tentare.example.com';
const ANFITRIONA = 'http://albapilates.example.com';
const SLUG = 'alba';
const S = 'studio-alba';
const BUNDLE = path.resolve('public/widget.js');
const FUENTES = path.resolve('public/widget-fuentes');

/** El color del TEMA del estudio (el que ven /reservar y su app). */
const COLOR_TEMA = '#7A2E4F';
/** La COLUMNA `studios.color_primario`: el índigo que escribe el alta. */
const INDIGO = '#4F46E5';
/** La letra de su web: la del `body` de la anfitriona. */
const LETRA_WEB = 'Georgia';

test.beforeAll(() => {
  expect(fs.existsSync(BUNDLE), 'Falta public/widget.js: genera el bundle con `npm run build:widget`.').toBe(true);
  expect(fs.existsSync(path.join(FUENTES, 'v1/fuentes.css')), 'Falta public/widget-fuentes: `npm run build:widget`.').toBe(true);
});

// Mismo fixture que e2e/widget-config-params.spec.ts, con la hora de Madrid
// explícita (en CI el runner va en UTC).
function fx(columna: string) {
  const mk = (d: string, h: string, id: string, tipo = 'tc-r') => ({
    id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-${d}T${h}:00:00+02:00`, fin: `2026-08-${d}T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: { id: S, nombre: 'Estudio Alba', slug: SLUG, ciudad: 'Madrid', direccion: 'Calle Mayor 1', email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', colorPrimario: columna },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sustitucionesConfirmadas: [],
    sesiones: [mk('12', '10', 's1'), mk('12', '12', 's2', 'tc-m'), mk('13', '10', 's3')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

/** Lo que manda el servidor en `estiloWidget` con este estilo guardado (su app, en Crema). */
function estiloWidget(w: Partial<WidgetWeb> | null) {
  return datosEstiloNativaDeBase(w ? { ...WIDGET_WEB_NEUTRO, ...w } : null, baseEstiloWeb(COLOR_TEMA, { estilo: 'crema' }));
}

/** Lo que debe pintar la nativa con esa respuesta: la misma función que el bundle, tras el viaje por JSON. */
function esperado(respuesta: unknown, columnas: boolean): EstiloNativa {
  const e = estiloDeLaNativa(leerDatosEstiloNativa(JSON.parse(JSON.stringify(respuesta))), { columnas });
  if (!e) throw new Error('Con este estilo la nativa debería pintar algo');
  return e;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const SIN_FONDO = 'rgba(0, 0, 0, 0)';

function entrada(config: Partial<ConfigConstructor> = {}): EntradaIntegracion {
  const widget = widgetPorId('horario');
  if (!esDisponible(widget)) throw new Error('«Horario y reservas» debería estar disponible');
  return { widget, config: { ...CONFIG_POR_DEFECTO, ...config }, origen: TENTARE, slug: SLUG, colorEstudio: INDIGO };
}

/** El `<div>` del código que copia hoy el constructor sin marco, sin su `<script>`. */
function divDe(e: EntradaIntegracion): string {
  const div = /<div data-tentare-booking[^>]*><\/div>/.exec(generarCodigo(e, 'nativa', 'html').codigo)?.[0];
  if (!div) throw new Error('El código sin marco debería llevar su <div>');
  return div;
}
const SCRIPT = `<script src="${TENTARE}/widget.js" async></script>`;

type Cuerpo = Record<string, unknown>;

/**
 * La web de la anfitriona con `html` pegado tal cual, el bundle real y una API
 * falsa que cuenta todo lo que se le pide. `estilo`: lo que respondería el
 * servidor en `estiloWidget` SI se lo piden (`undefined` = un servidor de antes,
 * que no lo manda nunca).
 */
async function enSuWeb(page: Page, html: string, o: { estilo?: unknown; columna?: string; fondoWeb?: string } = {}) {
  const datos: Cuerpo[] = [];
  const preflights = { datos: 0, eventos: 0 };
  const eventos: Cuerpo[] = [];
  const fuentes: string[] = [];
  const cors = { 'access-control-allow-origin': ANFITRIONA, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };

  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.addInitScript(vigilarPrimerPintado);
  // El aforo en vivo abriría un WebSocket contra el Supabase con el que se
  // compiló el bundle: aquí no se conecta a nada (sin él cae al tic, que en
  // lo que dura un test no llega a sonar).
  await page.routeWebSocket(/\/realtime\/v1\//, () => {});
  await page.route(`${TENTARE}/widget.js`, r => r.fulfill({ path: BUNDLE, contentType: 'text/javascript' }));
  await page.route(`${TENTARE}${RUTA_FUENTES_NATIVA}/**`, r => {
    const url = new URL(r.request().url());
    fuentes.push(url.pathname);
    const fichero = path.join(FUENTES, url.pathname.replace(/^\/widget-fuentes\//, ''));
    if (!fichero.startsWith(FUENTES) || !fs.existsSync(fichero)) return r.fulfill({ status: 404 });
    return r.fulfill({
      path: fichero,
      contentType: fichero.endsWith('.css') ? 'text/css' : 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route(`${TENTARE}/api/public/studio-data**`, r => {
    // El POST con JSON lleva preflight. Medido (29-sep, Playwright 1.61): en
    // Chromium y en WebKit lo resuelve Playwright solo y nunca llega aquí; se
    // contesta igual por si otra versión deja de hacerlo.
    if (r.request().method() === 'OPTIONS') { preflights.datos++; return r.fulfill({ status: 204, headers: cors }); }
    const cuerpo = (r.request().postDataJSON() ?? {}) as Cuerpo;
    datos.push(cuerpo);
    const conEstilo = cuerpo.estiloWidget === true && o.estilo !== undefined;
    return r.fulfill({
      status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ ...fx(o.columna ?? INDIGO), ...(conEstilo ? { estiloWidget: o.estilo } : {}) }),
    });
  });
  await page.route(`${TENTARE}/api/public/evento**`, r => {
    if (r.request().method() === 'OPTIONS') { preflights.eventos++; return r.fulfill({ status: 204, headers: cors }); }
    eventos.push((r.request().postDataJSON() ?? {}) as Cuerpo);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{"ok":true}' });
  });
  await page.route(`${TENTARE}/api/public/session**`, r => r.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"error":"no"}' }));
  await page.route(`${ANFITRIONA}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Alba Pilates</title>
<style>body{font-family:${LETRA_WEB}, serif;margin:0;padding:24px;${o.fondoWeb ? `background:${o.fondoWeb};color:#EEE;` : ''}}</style>
</head><body><h1>Horarios de Alba Pilates</h1>
${html}
</body></html>`,
  }));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ANFITRIONA}/horarios`);
  return { datos, eventos, fuentes, preflights };
}

/**
 * «Sin destello»: lo que tenía el envoltorio en el PRIMER momento en que una
 * clase existe en el DOM. Un `MutationObserver` sobre cada shadow root salta
 * en la microtarea que sigue al commit de React, antes de sus `useEffect`: si
 * el color o el estilo llegaran en un efecto posterior (como el color de
 * identidad hasta ahora), aquí se vería el de antes. Va en `addInitScript`
 * para estar puesto antes de que el bundle abra su shadow root.
 */
function vigilarPrimerPintado() {
  const w = window as unknown as { __primerPintado: Record<string, string>[] };
  w.__primerPintado = [];
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
    const sr = original.call(this, init);
    const i = w.__primerPintado.length;
    w.__primerPintado.push({});
    const mo = new MutationObserver(() => {
      const clase = sr.querySelector<HTMLElement>('.reserva-slot-row, button[title]');
      if (!clase) return;
      mo.disconnect();
      const raiz = Array.from(sr.children).find(c => c.tagName === 'DIV') as HTMLElement;
      const cs = getComputedStyle(raiz.firstElementChild as HTMLElement);
      w.__primerPintado[i] = {
        marca: cs.getPropertyValue('--portal-brand').trim().toUpperCase(),
        fondo: cs.backgroundColor,
        clase: getComputedStyle(clase).backgroundColor,
      };
    });
    mo.observe(sr, { childList: true, subtree: true });
    return sr;
  };
}
const primerPintado = (page: Page, i = 0) =>
  page.evaluate(n => (window as unknown as { __primerPintado: Record<string, string>[] }).__primerPintado[n], i);

/** Lo que se ve de un widget: su envoltorio (el `<div>` que pinta React) y una clase. */
async function medir(page: Page, i = 0) {
  const host = page.locator('[data-tentare-booking]').nth(i);
  return host.evaluate((h) => {
    // La raíz que monta el bundle (hija directa del shadow, tras su <style>).
    const raiz = Array.from(h.shadowRoot!.children).find(c => c.tagName === 'DIV') as HTMLElement;
    const env = raiz.firstElementChild as HTMLElement;
    const cs = getComputedStyle(env);
    // En columnas, la celda de la rejilla (lleva `title`); en «Día a día», la tarjeta.
    const celda = h.shadowRoot!.querySelector<HTMLElement>('button[title="Reformer"]');
    const fila = h.shadowRoot!.querySelector<HTMLElement>('.reserva-slot-row');
    return {
      marca: cs.getPropertyValue('--portal-brand').trim().toUpperCase(),
      fondo: cs.backgroundColor,
      radio: cs.borderTopLeftRadius,
      relleno: cs.paddingTop,
      esquema: cs.colorScheme,
      letra: cs.fontFamily,
      titular: cs.getPropertyValue('--portal-heading-font').trim(),
      celda: celda ? { fondo: getComputedStyle(celda).backgroundColor, letra: getComputedStyle(celda).fontFamily } : null,
      fila: fila ? getComputedStyle(fila).backgroundColor : null,
    };
  });
}

/** El calendario ya pintado con sus datos: el control de todo lo que se mira después. */
async function pintado(page: Page, i = 0) {
  await expect(page.locator('[data-tentare-booking]').nth(i).getByRole('button', { name: /10:00\s*Reformer/ }).first()).toBeVisible({ timeout: 30_000 });
}

const linksFuentes = (page: Page) => page.locator('link[data-tentare-fuentes]');

test('sin nada elegido se ve como siempre, pero con el color del TEMA y no el índigo de la columna', async ({ page }) => {
  const { datos, fuentes } = await enSuWeb(page, divDe(entrada()) + SCRIPT, { estilo: estiloWidget(null) });
  await pintado(page);
  expect(datos.length).toBeGreaterThan(0);
  // Lo pide en la primera carga, en la MISMA petición que las clases.
  expect(datos[0]).toMatchObject({ slug: SLUG, liviano: true, estiloWidget: true });

  const m = await medir(page);
  expect(m.marca).toBe(COLOR_TEMA);
  expect(m.fondo).toBe(SIN_FONDO);
  expect(m.letra).toContain(LETRA_WEB);
  expect(m.celda?.fondo).toBe('rgb(255, 255, 255)');
  // Sin destello: el color ya estaba en el primer pintado de las clases.
  expect(await primerPintado(page)).toEqual({ marca: COLOR_TEMA, fondo: SIN_FONDO, clase: 'rgb(255, 255, 255)' });
  // Ni una fuente: nada elegido es exactamente lo de siempre.
  expect(fuentes).toEqual([]);
  await expect(linksFuentes(page)).toHaveCount(0);
});

test('⚠️ regresión: un servidor de antes (sin `estiloWidget`) pinta lo mismo que hoy, con su columna', async ({ page, context }) => {
  // Con la columna igual que el tema, «sin nada elegido» y «servidor de antes»
  // tienen que medir EXACTAMENTE igual: el envoltorio y la celda.
  const { datos } = await enSuWeb(page, divDe(entrada()) + SCRIPT, { columna: COLOR_TEMA });
  await pintado(page);
  expect(datos.length).toBeGreaterThan(0);
  const antes = await medir(page);
  // Y sin el fotograma en oliva de antes (el color llegaba en un `useEffect`).
  expect((await primerPintado(page))?.marca).toBe(COLOR_TEMA);

  const otra = await context.newPage();
  const x = await enSuWeb(otra, divDe(entrada()) + SCRIPT, { estilo: estiloWidget(null), columna: INDIGO });
  await pintado(otra);
  expect(x.datos.length).toBeGreaterThan(0);
  expect(await medir(otra)).toEqual(antes);
  expect(antes.marca).toBe(COLOR_TEMA);
});

test('Carbón en su recuadro («Día a día»): los tokens, el recuadro y la noche; con «Como tu app», la letra de su web y cero fuentes', async ({ page }) => {
  const respuesta = estiloWidget({ estilo: 'carbon' });
  const e = esperado(respuesta, false);
  expect(e.raiz.colorScheme).toBe('dark');
  expect(e.letra).toBeNull();

  const { datos, fuentes } = await enSuWeb(page, divDe(entrada({ diseno: 'completo' })) + SCRIPT, { estilo: respuesta });
  await expect(page.locator('.reserva-slot-row', { hasText: 'Reformer' }).first()).toBeVisible({ timeout: 30_000 });
  expect(datos.length).toBeGreaterThan(0);

  const m = await medir(page);
  expect(m.fondo).toBe(rgb(e.tokens!.bg));
  expect(m.radio).toBe('12px');
  expect(m.relleno).toBe('16px');
  expect(m.esquema).toBe('dark');
  expect(m.marca).toBe(e.raiz['--portal-brand'].toUpperCase());
  expect(m.fila).toBe(rgb(e.tokens!.surface));
  // Sin destello: nunca se pintó con la paleta de día.
  expect(await primerPintado(page)).toEqual({ marca: m.marca, fondo: m.fondo, clase: m.fila });
  // La enmienda: elegir un color no le quita la letra de su web.
  expect(m.letra).toContain(LETRA_WEB);
  expect(fuentes).toEqual([]);
  await expect(linksFuentes(page)).toHaveCount(0);
});

test('fundido sobre una web oscura: sin recuadro (se ve su web detrás) y las tarjetas de noche', async ({ page }) => {
  const respuesta = estiloWidget({ web: 'oscura', fundido: true });
  const e = esperado(respuesta, false);
  expect(e.raiz.colorScheme).toBe('dark');
  expect(e.raiz.background).toBeUndefined();

  const { datos } = await enSuWeb(page, divDe(entrada({ diseno: 'completo' })) + SCRIPT, { estilo: respuesta, fondoWeb: '#1D1E1B' });
  await expect(page.locator('.reserva-slot-row', { hasText: 'Reformer' }).first()).toBeVisible({ timeout: 30_000 });
  expect(datos.length).toBeGreaterThan(0);

  const m = await medir(page);
  expect(m.fondo).toBe(SIN_FONDO);
  expect(m.esquema).toBe('dark');
  expect(m.fila).toBe(rgb(e.tokens!.surface));
});

test('Carbón con «Siete días en columnas» (lo de por defecto): no se pinta en oscuro, y con «Como tu app» no le llega nada más', async ({ page }) => {
  const respuesta = estiloWidget({ estilo: 'carbon' });
  const e = esperado(respuesta, true);
  expect(e.soloLetra).toBe(true);

  const { datos, fuentes } = await enSuWeb(page, divDe(entrada()) + SCRIPT, { estilo: respuesta });
  await pintado(page);
  expect(datos.length).toBeGreaterThan(0);

  const m = await medir(page);
  expect(m.celda?.fondo).toBe('rgb(255, 255, 255)');
  expect(m.fondo).toBe(SIN_FONDO);
  expect(m.esquema).toBe('light');
  // La marca de siempre (la del tema), como sin nada elegido.
  expect(m.marca).toBe(COLOR_TEMA);
  expect(m.letra).toContain(LETRA_WEB);
  expect(fuentes).toEqual([]);
  await expect(linksFuentes(page)).toHaveCount(0);
});

test('una letra ELEGIDA («Editorial»), con dos widgets: una sola hoja de Tentare, y la pareja en el cuerpo y en los titulares', async ({ page }) => {
  const respuesta = estiloWidget({ letra: 'editorial' });
  expect(esperado(respuesta, true).letra).toBe('editorial');

  const html = `${divDe(entrada())}\n${divDe(entrada({ diseno: 'completo', etiqueta: 'portada' }))}\n${SCRIPT}`;
  const { datos, fuentes } = await enSuWeb(page, html, { estilo: respuesta });
  await pintado(page, 0);
  await expect(page.locator('[data-tentare-booking]').nth(1).locator('.reserva-slot-row').first()).toBeVisible({ timeout: 30_000 });
  expect(datos.length).toBeGreaterThan(1);

  await expect(linksFuentes(page)).toHaveCount(1);
  await expect(linksFuentes(page)).toHaveAttribute('href', `${TENTARE}${HOJA_FUENTES_NATIVA}`);
  expect(fuentes.filter(u => u === HOJA_FUENTES_NATIVA)).toHaveLength(1);
  // El navegador baja el woff2 que usa, y lo CARGA de verdad desde otro origen
  // (sin la cabecera CORS, `document.fonts` no lo daría por cargado).
  await expect.poll(() => fuentes.some(u => u.endsWith('/figtree/figtree-latin.woff2'))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.fonts.check("12px 'Tentare Figtree'"))).toBe(true);

  for (const i of [0, 1]) {
    const m = await medir(page, i);
    expect(m.letra).toContain('Tentare Figtree');
    expect(m.titular).toContain('Tentare Libre Caslon Text');
  }
  // La rejilla lee la misma variable que el resto.
  expect((await medir(page, 0)).celda?.letra).toContain('Tentare Figtree');
});

test('⚠️ el diseño propio del código gana: ni se pide el estilo, ni se pinta, ni se piden fuentes', async ({ page, context }) => {
  // Aunque el servidor tenga un estilo guardado para dárselo.
  const respuesta = estiloWidget({ estilo: 'carbon', letra: 'editorial' });
  const { datos, fuentes } = await enSuWeb(page, divDe(entrada({ identidad: 'propia', marca: '#E11D48' })) + SCRIPT, { estilo: respuesta });
  await pintado(page);
  expect(datos.length).toBeGreaterThan(0);
  expect(datos.some(d => d.estiloWidget === true)).toBe(false);
  const m = await medir(page);
  expect(m.marca).toBe('#E11D48');
  expect(m.fondo).toBe(SIN_FONDO);
  expect(fuentes).toEqual([]);
  await expect(linksFuentes(page)).toHaveCount(0);

  // Lo mismo con un código de antes del constructor, escrito a mano con `data-color`.
  const otra = await context.newPage();
  const x = await enSuWeb(otra, `<div data-tentare-booking data-studio="${SLUG}" data-color="#0E7490"></div>${SCRIPT}`, { estilo: respuesta });
  await pintado(otra);
  expect(x.datos.length).toBeGreaterThan(0);
  expect(x.datos.some(d => d.estiloWidget === true)).toBe(false);
  expect((await medir(otra)).marca).toBe('#0E7490');
  expect(x.fuentes).toEqual([]);
});

test('⚠️ una respuesta rara no rompe nada: se ve como sin nada elegido, con la columna de último recurso', async ({ page }) => {
  const { datos, fuentes } = await enSuWeb(page, divDe(entrada()) + SCRIPT, {
    estilo: { color: 'red;}', web: { widgetWeb: { estilo: 'x' }, app: 7 } },
  });
  await pintado(page);
  expect(datos.length).toBeGreaterThan(0);
  // El control: la pidió. Si no, «se ve como sin nada» sería verdad sin haber leído nada raro.
  expect(datos[0]).toMatchObject({ estiloWidget: true });
  const m = await medir(page);
  expect(m.marca).toBe(INDIGO);
  expect(m.fondo).toBe(SIN_FONDO);
  expect(m.letra).toContain(LETRA_WEB);
  expect(fuentes).toEqual([]);
});

test('`widget_loaded` lleva la firma de sus `data-*` (la misma que calcula el panel); `widget_viewed`, no', async ({ page, context }) => {
  const e = entrada();
  const { eventos } = await enSuWeb(page, divDe(e) + SCRIPT, { estilo: estiloWidget(null) });
  await pintado(page);
  await expect.poll(() => eventos.length).toBeGreaterThan(1);
  const cargado = eventos.find(x => x.tipo === 'widget_loaded');
  const visto = eventos.find(x => x.tipo === 'widget_viewed');
  expect(cargado?.firma).toBe(firmaContenidoDe(e, 'nativa'));
  expect(visto).toBeDefined();
  expect(visto && 'firma' in visto).toBe(false);
  // La forma y la web las pone el servidor (por la cabecera Origin): no viajan.
  expect(cargado && ('forma' in cargado || 'anfitrion' in cargado)).toBe(false);

  // Un código ANTERIOR, escrito a mano, también manda la suya: la calcula el
  // bundle de lo pegado, no hace falta volver a copiarlo.
  const otra = await context.newPage();
  const x = await enSuWeb(otra, `<div data-tentare-booking data-studio="${SLUG}" data-color="#0E7490" data-ref="portada"></div>${SCRIPT}`);
  await pintado(otra);
  await expect.poll(() => x.eventos.some(ev => ev.tipo === 'widget_loaded')).toBe(true);
  const suya = firmaDeUrl(fuenteDeDataset({ tentareBooking: '', studio: SLUG, color: '#0E7490', ref: 'portada' }));
  expect(x.eventos.find(ev => ev.tipo === 'widget_loaded')?.firma).toBe(suya);
  expect(suya).not.toBe(firmaContenidoDe(e, 'nativa'));
});

test('⚠️ el servidor de verdad sirve las fuentes con CORS abierto y un año de caché', async ({ request }) => {
  // Contra el servidor bajo test, no un `page.route`: es lo que decide
  // next.config.ts, y en CI también que la carpeta viaje en el artefacto del
  // build. Sin `access-control-allow-origin`, la web del estudio no las usaría
  // (cae a la letra de reserva sin ningún error).
  for (const ruta of [HOJA_FUENTES_NATIVA, `${RUTA_FUENTES_NATIVA}/figtree/figtree-latin.woff2`]) {
    const r = await request.get(ruta);
    expect(r.status(), ruta).toBe(200);
    expect(r.headers()['access-control-allow-origin'], ruta).toBe('*');
    expect(r.headers()['cache-control'], ruta).toBe('public, max-age=31536000, immutable');
  }
});
