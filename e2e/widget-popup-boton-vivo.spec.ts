import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Request } from '@playwright/test';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';
import { CONFIG_POR_DEFECTO } from '../lib/widgets/config.ts';
import { generarCodigo, conVistaPrevia, type EntradaIntegracion } from '../lib/widgets/integracion.ts';
import { RUTA_BOTON_VIVO, type BotonVivo } from '../lib/widgets/boton-vivo.ts';
import { WIDGET_WEB_NEUTRO, leerWidgetWeb } from '../lib/reservar/estilo-web-tipos.ts';
import { baseEstiloWeb, botonDeLaVentana } from '../lib/reservar/estilo-web.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fase D del constructor de widgets: el botón que abre la ventana (método
// «Popup») sigue el estilo de sus widgets EN SU WEB, sin volver a pegar nada.
//
// El código nuevo pinta el botón dos veces por propiedad —el hex de cuando se
// copió y después `var(--tentare-boton,<ese hex>)`— y `widget-popup.js` rellena
// las variables con UNA regla `<style>` por estudio, pedida a
// `/api/public/widget-boton` (lib/widgets/boton-vivo.ts). Aquí se mira en una
// web de verdad, con el script REAL compilado:
//   · que pinta el color y las esquinas de ahora, con una petición por estudio;
//   · que cualquier fallo deja el respaldo, sin escribir CSS;
//   · que no pide nada cuando no hay nada que pintar: un filtro de HTML que se
//     comió los `var()`, un código de antes, la vista previa del panel;
//   · y que dos estudios en la misma página no se pisan.
//
// Todo en orígenes ficticios `http` servidos con `page.route`: ni localhost ni
// la bandera de Local Network Access. El endpoint de verdad se prueba aparte,
// al final, contra el servidor bajo test.
//
// ⚠️ `public/widget-popup.js` no está en git: lo genera `npm run build:widget`
// (en CI, dentro de `npm run build`, y viaja en el artefacto a los shards).
// En local hay que generarlo antes; si no, este fichero lo dice y para.
// ─────────────────────────────────────────────────────────────────────────────

const TENTARE = 'http://tentare.example.com';
const ANFITRIONA = 'http://albapilates.example.com';
const SLUG = 'alba';
const BUNDLE = path.resolve('public/widget-popup.js');

/** Lo que había en el panel al copiar: es el respaldo que lleva el código. */
const RESPALDO: BotonVivo = { fondo: '#7A2E4F', texto: '#FFFFFF', esquinas: 'pill' };
const RESPALDO_RGB = 'rgb(122, 46, 79)';
/** Lo que dice el endpoint que se ve ahora (el estilo cambió después de pegarlo). */
const VIVO: BotonVivo = { fondo: '#1B2418', texto: '#F2F6EE', esquinas: 'recto' };

test.beforeAll(() => {
  expect(fs.existsSync(BUNDLE), 'Falta public/widget-popup.js: genera el bundle con `npm run build:widget`.').toBe(true);
});

/** El código que copia hoy el constructor para «Horario y reservas» en popup. */
function codigoNuevo(slug = SLUG, botonVivo: BotonVivo = RESPALDO): string {
  const widget = widgetPorId('horario');
  if (!esDisponible(widget)) throw new Error('«Horario y reservas» debería estar disponible');
  const e: EntradaIntegracion = { widget, config: CONFIG_POR_DEFECTO, origen: TENTARE, slug, colorEstudio: '#343825', botonVivo };
  return generarCodigo(e, 'popup', 'html').codigo;
}

/** Un código de ANTES de la Fase D, escrito a mano: colores literales y nada más. */
const CODIGO_ANTERIOR = `<button type="button" data-tentare-popup="${TENTARE}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario" data-tentare-titulo="Horario y reservas" data-tentare-ancho="720" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;font:inherit;font-weight:600;font-size:15px;line-height:1.2;text-decoration:none;cursor:pointer;background:#7A2E4F;color:#FFFFFF;border:1.5px solid #7A2E4F;border-radius:999px;">Reservar clase</button>
<script src="${TENTARE}/widget-popup.js" async></script>`;

/** `cors`: el `Access-Control-Allow-Origin` que responde el endpoint (por defecto, `*`). */
type Respuesta = 'abort' | { status?: number; cuerpo?: unknown; cors?: string };

/**
 * La web de la anfitriona con `html` pegado tal cual, el script real y un
 * endpoint falso que cuenta las peticiones y responde lo que diga `responder`.
 */
async function enSuWeb(page: Page, html: string, responder: (slug: string) => Respuesta = () => ({ cuerpo: VIVO })) {
  const pedidos: string[] = [];
  const cargas = { script: 0 };
  await page.route(`${TENTARE}/widget-popup.js`, r => {
    cargas.script++;
    return r.fulfill({ path: BUNDLE, contentType: 'text/javascript' });
  });
  await page.route(`${TENTARE}${RUTA_BOTON_VIVO}**`, r => {
    const slug = new URL(r.request().url()).searchParams.get('slug') ?? '';
    pedidos.push(slug);
    const x = responder(slug);
    if (x === 'abort') return r.abort();
    return r.fulfill({
      status: x.status ?? 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': x.cors ?? '*' },
      body: JSON.stringify(x.cuerpo ?? {}),
    });
  });
  // Lo que abre la ventana: no se mira aquí, basta con que exista.
  await page.route(`${TENTARE}/reservar/**`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Reservas</title><p>Horario</p>' }));
  await page.route(`${ANFITRIONA}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Alba Pilates</title></head><body>
<p>Horarios de Alba Pilates</p>
${html}
</body></html>`,
  }));
  await page.goto(`${ANFITRIONA}/horarios`);
  return { pedidos, cargas };
}

/** Se resuelve cuando la petición al endpoint ha terminado, bien o mal. */
function peticionTerminada(page: Page): Promise<void> {
  return new Promise(res => {
    const es = (r: Request) => r.url().includes(RUTA_BOTON_VIVO);
    page.on('requestfinished', r => { if (es(r)) res(); });
    page.on('requestfailed', r => { if (es(r)) res(); });
  });
}

async function abreLaVentana(page: Page, boton = page.locator('[data-tentare-popup]').first()) {
  await boton.click();
  await expect(page.locator('[data-tentare-popup-ventana]')).toBeAttached();
}

test('el botón toma el color y las esquinas de ahora; dos botones del mismo estudio, una sola petición', async ({ page }) => {
  // Pegado dos veces, con su script cada vez: lo que hace quien pone el botón
  // arriba y abajo de la página.
  const { pedidos } = await enSuWeb(page, `${codigoNuevo()}\n${codigoNuevo()}`);
  const botones = page.locator('[data-tentare-popup]');
  await expect(botones).toHaveCount(2);
  for (const b of await botones.all()) {
    await expect(b).toHaveCSS('background-color', 'rgb(27, 36, 24)');
    await expect(b).toHaveCSS('color', 'rgb(242, 246, 238)');
    await expect(b).toHaveCSS('border-top-left-radius', '6px');
  }
  await expect(page.locator('style[data-tentare-boton]')).toHaveCount(1);
  expect(pedidos).toEqual([SLUG]);
  // Y sigue abriendo la ventana, claro.
  await abreLaVentana(page);
});

const FALLOS: { nombre: string; respuesta: Respuesta }[] = [
  { nombre: 'un 500', respuesta: { status: 500, cuerpo: { error: 'No se ha podido leer el botón.' } } },
  { nombre: 'la red caída', respuesta: 'abort' },
  // «Sin CORS» se simula con OTRO origen permitido y no quitando la cabecera:
  // si falta, Playwright la añade él solo al servir un `page.route`
  // (microsoft/playwright#12929), y el navegador leería la respuesta.
  { nombre: 'un 200 que CORS no deja leer', respuesta: { cuerpo: VIVO, cors: 'http://otra-web.example.com' } },
  { nombre: 'un 200 con algo que no es un color', respuesta: { cuerpo: { ...VIVO, fondo: '#fff;}body{display:none' } } },
];

for (const f of FALLOS) {
  test(`⚠️ con ${f.nombre}, se queda el respaldo y no se escribe ningún CSS`, async ({ page }) => {
    const terminada = peticionTerminada(page);
    const { pedidos } = await enSuWeb(page, codigoNuevo(), () => f.respuesta);
    // Primero, que lo ha intentado: sin esto, «se queda el respaldo» podría ser
    // verdad por no haber pedido nada.
    await expect.poll(() => pedidos.length).toBeGreaterThan(0);
    await terminada;
    await page.waitForTimeout(300);
    await expect(page.locator('style[data-tentare-boton]')).toHaveCount(0);
    const boton = page.locator('[data-tentare-popup]');
    await expect(boton).toHaveCSS('background-color', RESPALDO_RGB);
    await expect(boton).toHaveCSS('border-top-left-radius', '999px');
    await expect(page.getByText('Horarios de Alba Pilates')).toBeVisible();
  });
}

test('⚠️ un filtro de HTML que se comió los `var()`: el botón literal de cuando se copió, y no se pide nada', async ({ page }) => {
  // Lo que deja KSES en un WordPress sin `unfiltered_html`: las declaraciones
  // con `var()` fuera, los literales dentro.
  const filtrado = codigoNuevo().replace(/[a-z-]+:[^;"]*var\(--tentare-[^;"]*;/g, '');
  expect(filtrado).not.toContain('var(');
  expect(filtrado).toContain(`background:${RESPALDO.fondo};`);
  const { pedidos, cargas } = await enSuWeb(page, filtrado);
  // El control: el script ha cargado y funciona.
  await abreLaVentana(page);
  expect(cargas.script).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(pedidos).toEqual([]);
  const boton = page.locator('[data-tentare-popup]');
  await expect(boton).toHaveCSS('background-color', RESPALDO_RGB);
  await expect(boton).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(boton).toHaveCSS('border-top-left-radius', '999px');
});

test('⚠️ un código de antes de la Fase D: sus colores literales, y no se pide nada', async ({ page }) => {
  const { pedidos, cargas } = await enSuWeb(page, CODIGO_ANTERIOR);
  await abreLaVentana(page);
  expect(cargas.script).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(pedidos).toEqual([]);
  await expect(page.locator('[data-tentare-popup]')).toHaveCSS('background-color', RESPALDO_RGB);
});

test('dos estudios en la misma página (una cadena con dos sedes): una petición cada uno, y cada botón con el suyo', async ({ page }) => {
  // `alba` y `alba-centro` a propósito: el selector de uno no debe alcanzar al otro.
  const OTRA = 'alba-centro';
  const { pedidos } = await enSuWeb(
    page,
    `${codigoNuevo()}\n${codigoNuevo(OTRA)}`,
    slug => ({ cuerpo: slug === OTRA ? { fondo: '#0B3D91', texto: '#FFFFFF', esquinas: 'redondeado' } : VIVO }),
  );
  const alba = page.locator(`[data-tentare-popup*="/reservar/${SLUG}?"]`);
  const centro = page.locator(`[data-tentare-popup*="/reservar/${OTRA}?"]`);
  await expect(alba).toHaveCSS('background-color', 'rgb(27, 36, 24)');
  await expect(alba).toHaveCSS('border-top-left-radius', '6px');
  await expect(centro).toHaveCSS('background-color', 'rgb(11, 61, 145)');
  await expect(centro).toHaveCSS('border-top-left-radius', '13px');
  await expect(page.locator('style[data-tentare-boton]')).toHaveCount(2);
  expect([...pedidos].sort()).toEqual([SLUG, OTRA].sort());
});

test('⚠️ la vista previa del panel (`vista-previa=1`) se pinta con el borrador: no pide lo publicado', async ({ page }) => {
  // Con las variables en el `style`: lo único que la deja fuera es la URL.
  const previa = codigoNuevo().replace(/data-tentare-popup="([^"]*)"/, (_, url: string) => `data-tentare-popup="${conVistaPrevia(url)}"`);
  expect(previa).toContain('vista-previa=1');
  expect(previa).toContain('var(--tentare-boton');
  const { pedidos, cargas } = await enSuWeb(page, previa);
  await abreLaVentana(page);
  expect(cargas.script).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(pedidos).toEqual([]);
});

// ── El endpoint de verdad ────────────────────────────────────────────────────
//
// Contra el servidor bajo test y su semilla E2E (lib/studio-seo.ts): la misma
// base que /reservar. Es el servidor, no el navegador, así que basta Chromium.

test('el endpoint: el botón de la ventana de la semilla, público y cacheable; un slug raro, 400 sin caché', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Es el servidor, no el navegador: una pasada basta.');
  // Las mismas palancas que la semilla (lib/studio-seo.ts).
  const base = baseEstiloWeb(
    process.env.E2E_COLOR_PRIMARIO ?? '#1A1A1A',
    process.env.E2E_APARIENCIA_APP ? JSON.parse(process.env.E2E_APARIENCIA_APP) : null,
  );

  const arena = await page.request.get(`${RUTA_BOTON_VIVO}?slug=tentare-web-arena`);
  expect(arena.status()).toBe(200);
  expect(arena.headers()['access-control-allow-origin']).toBe('*');
  expect(arena.headers()['cache-control']).toContain('s-maxage=60');
  // Exactamente esto y nada más (ni el id del estudio ni nada suyo).
  expect(await arena.json()).toEqual(botonDeLaVentana(
    leerWidgetWeb({ ...WIDGET_WEB_NEUTRO, estilo: 'arena', letra: 'editorial', boton: 'tinta' }), base,
  ));

  // Sin nada elegido, la regla de F1: el día del despliegue no cambia ningún botón.
  const f1 = await page.request.get(`${RUTA_BOTON_VIVO}?slug=tentare`);
  expect(f1.status()).toBe(200);
  expect(await f1.json()).toEqual(botonDeLaVentana(null, base));

  const raro = await page.request.get(`${RUTA_BOTON_VIVO}?slug=a%22b`);
  expect(raro.status()).toBe(400);
  expect(raro.headers()['cache-control']).toBe('no-store');
});
