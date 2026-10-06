import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ir, enOscuro, DECISIONES } from './panel-sembrado';
import { barra, chat, campoChat, conAcciones, conAsistente, json, LISTA, ndjson, pedirAlAsistente, RESPUESTA, SEGUNDA, sugerencia } from './asistente-andamiaje';

// ─────────────────────────────────────────────────────────────────────────────
// «Pregúntale a Tentare» en el iPhone (proyecto `webkit-publico`, iPhone 13).
//
// El fundador, desde su iPhone (6-oct-2026): «le das a escribir y se hace zoom,
// le das a cualquier lado zoom, es 0 responsive». Lo que se vigila:
//   · ningún desbordamiento horizontal (lo que obliga a Safari a encoger la
//     página) ni vacío, ni con tarjetas de clases y de recibos, ni con el
//     cajón de conversaciones abierto;
//   · el campo de escribir a 16 px o más (por debajo, Safari amplía al
//     enfocarlo y no vuelve), y la regla del panel con el dedo en la hoja;
//   · el campo abajo, por encima de la barra del panel, y nada flotando encima.
//
// ⚠️ WebKit de Playwright NO es Safari de iOS: comparte motor, pero aquí no hay
// teclado virtual ni zoom al enfocar. Lo que se prueba es la CAUSA (tamaños y
// anchos), no el síntoma; el teclado (lib/asistente/teclado.ts) se ha de mirar
// en un iPhone de verdad.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 150_000 });

const CAPTURAS = process.env.ASISTENTE_CAPTURAS;

async function captura(page: Page, nombre: string) {
  await page.waitForTimeout(500); // las animaciones de entrada
  const png = await page.screenshot();
  await test.info().attach(nombre, { body: png, contentType: 'image/png' });
  if (CAPTURAS) {
    mkdirSync(CAPTURAS, { recursive: true });
    await page.screenshot({ path: join(CAPTURAS, `movil-${nombre}.png`) });
  }
}

/** Lo que se sale por la derecha: la página entera y, dentro del chat, cualquier caja que no haga su propio scroll. */
async function desbordes(page: Page) {
  return page.evaluate(() => {
    const ancho = window.innerWidth;
    const fuera: string[] = [];
    const chat = document.querySelector('[data-testid="chat-asistente"]');
    for (const el of Array.from(chat?.querySelectorAll('*') ?? [])) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= ancho + 1) continue;
      // Dentro de una caja con scroll horizontal propio, salirse es lo esperado.
      let p = el.parentElement;
      let dentroDeScroll = false;
      while (p && p !== chat) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') && p.getBoundingClientRect().right <= ancho + 1) { dentroDeScroll = true; break; }
        p = p.parentElement;
      }
      if (!dentroDeScroll) fuera.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')} → ${Math.round(r.right)}px`);
    }
    return {
      ancho,
      pagina: document.documentElement.scrollWidth,
      cuerpo: document.body.scrollWidth,
      fuera: fuera.slice(0, 8),
    };
  });
}

async function sinDesborde(page: Page, momento: string) {
  const d = await desbordes(page);
  expect(d.pagina, `${momento}: la página mide ${d.pagina}px en un iPhone de ${d.ancho}px`).toBeLessThanOrEqual(d.ancho);
  expect(d.cuerpo, `${momento}: el body se sale`).toBeLessThanOrEqual(d.ancho);
  expect(d.fuera, `${momento}: cajas que se salen por la derecha`).toEqual([]);
}

for (const tema of ['claro', 'oscuro'] as const) {
  test(`iPhone · ${tema}: sin scroll horizontal, el campo a 16 px abajo del todo y el cajón de conversaciones`, async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Es la prueba del iPhone: corre en el proyecto webkit-publico');
    if (tema === 'oscuro') await enOscuro(page);
    let vez = 0;
    const n = await conAsistente(page, {
      responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(vez++ === 0 ? RESPUESTA : SEGUNDA) }),
    });
    await page.route((u) => u.pathname === '/api/asistente/conversaciones', (r) => json(r, { conversaciones: LISTA }));

    // ── Vacío ──
    await ir(page, 'asistente');
    await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
    await sinDesborde(page, 'vacío');

    const campo = campoChat(page);
    const tamano = await campo.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(tamano, 'el campo del chat no baja de 16 px (Safari amplía la página por debajo)').toBeGreaterThanOrEqual(16);

    // La regla del panel con el dedo está en la hoja (un `@media` DE VERDAD, no un
    // texto que se parezca) y su valor se resuelve a 16 px aunque el campo lleve
    // `text-sm` y un `style` en línea más pequeño.
    const regla = await page.evaluate(() => {
      const media = Array.from(document.styleSheets)
        .flatMap((h) => { try { return Array.from(h.cssRules); } catch { return []; } })
        .find((r) => r.type === 4 && (r as CSSMediaRule).conditionText?.includes('coarse') && r.cssText.includes('.panel-app')
          && /font-size:\s*max\(16px,[^;]*\)\s*!important/.test(r.cssText)) as CSSMediaRule | undefined;
      const decl = Array.from(media?.cssRules ?? []).map((r) => (r as CSSStyleRule).style?.getPropertyValue('font-size')).find(Boolean) ?? '';
      const raiz = document.querySelector('.panel-app');
      let efectivo = 0;
      let conDedo = 0;
      if (raiz && decl) {
        const sonda = document.createElement('input');
        sonda.className = 'text-sm';
        sonda.style.setProperty('font-size', decl, 'important');
        raiz.appendChild(sonda);
        efectivo = parseFloat(getComputedStyle(sonda).fontSize);
        sonda.remove();
      }
      // Si este WebKit dice que el puntero es grueso, la regla tiene que estar aplicándose de verdad.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      if (raiz && coarse) {
        const pequeno = document.createElement('input');
        pequeno.className = 'text-sm';
        pequeno.style.fontSize = '13px';
        raiz.appendChild(pequeno);
        conDedo = parseFloat(getComputedStyle(pequeno).fontSize);
        pequeno.remove();
      }
      return { hay: Boolean(media), efectivo, coarse, conDedo };
    });
    expect(regla.hay, 'la hoja impone 16 px a los campos del panel con el dedo').toBe(true);
    expect(regla.efectivo).toBeGreaterThanOrEqual(16);
    if (regla.coarse) expect(regla.conDedo, 'con el dedo, un campo de 13 px en línea se queda en 16').toBeGreaterThanOrEqual(16);
    await captura(page, `${tema}-vacio`);

    // ── Una conversación con tarjetas: clases (tabla) y recibos ──
    await sugerencia(page, '¿Qué clases hay mañana?').click();
    await expect(chat(page).locator('[data-bloque="clases"]')).toBeVisible({ timeout: 30_000 });
    await campo.fill('¿Y qué pagos tengo pendientes?');
    await campo.press('Enter');
    await expect(chat(page).locator('[data-bloque="recibos"]')).toBeVisible({ timeout: 30_000 });
    await expect(chat(page).locator('[data-tenti-asistente]').last()).toHaveAttribute('data-momento', 'listo', { timeout: 15_000 });
    expect(n.preguntas, 'se preguntó de verdad').toBeGreaterThan(1);
    await sinDesborde(page, 'conversación con tarjetas');

    // El campo, abajo y por encima de la barra del panel (56 px), y nada flotando encima.
    const alto = page.viewportSize()!.height;
    const caja = await campo.boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto - 56);
    expect(caja!.y, 'el campo está en la mitad de abajo').toBeGreaterThan(alto / 2);
    const encima = await page.evaluate(() => {
      const enviar = document.querySelector('[data-testid="chat-asistente"] form button');
      if (!enviar) return 'sin botón';
      const r = enviar.getBoundingClientRect();
      const quien = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return quien && enviar.contains(quien) ? null : (quien?.outerHTML ?? '').slice(0, 120);
    });
    expect(encima, 'nada tapa el botón de enviar').toBeNull();

    await chat(page).getByTestId('chat-mensajes').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await captura(page, `${tema}-conversacion`);
    await chat(page).locator('[data-bloque="clases"]').scrollIntoViewIfNeeded();
    await captura(page, `${tema}-conversacion-clases`);

    // ── El cajón de conversaciones ──
    await chat(page).getByRole('button', { name: 'Tus conversaciones' }).click();
    const cajon = page.getByRole('dialog', { name: 'Tus conversaciones' });
    await expect(cajon).toBeVisible();
    await expect(cajon.getByRole('button', { name: 'Nueva conversación' })).toBeVisible();
    await sinDesborde(page, 'cajón abierto');
    const d = await cajon.evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { right: r.right, ancho: window.innerWidth, scroll: c.scrollWidth - c.clientWidth };
    });
    expect(d.right).toBeLessThanOrEqual(d.ancho + 1);
    expect(d.scroll, 'los títulos largos se cortan, no empujan el cajón').toBeLessThanOrEqual(0);
    await captura(page, `${tema}-cajon`);
  });
}

// ── «Al darle a "Pregúntale a Tentare" vuelve a hacerse ese zoom» (6-oct, tras #2563) ──
//
// Medido en Safari de iOS 26.5 (simulador, con este mismo andamiaje servido por
// un proxy): con el campo a 16 px NO hay zoom al enfocarlo, ni con la página
// desbordada 90 px; con un campo de 12 px sí (escala 1,333), y con
// `maximum-scale=1` ya no (y el pellizco sigue ampliando: escala 1,27). Lo que
// SÍ estaba roto es el doble toque: `touch-action: manipulation` iba solo en
// `.panel-app`, y WebKit lo mira solo hasta el contenedor con scroll más
// cercano. El chat entero vive dentro de uno (y el <textarea> es otro), así que
// ahí el doble toque volvía a ampliar. Lo que se vigila:
//   · el Centro de Control con la barra, con textos largos, y /asistente tras
//     pulsarla: nada más ancho que la pantalla;
//   · todo contenedor con scroll del chat, y el campo, con `manipulation`;
//   · la meta viewport con `maximum-scale=1` en iOS…
//   · …y SIN él en Android, donde sí quitaría el pellizco (proyecto chromium).
// ⚠️ Ni WebKit de Playwright ni el simulador son el iPhone del fundador: esto
// vigila las causas, no promete el síntoma.

/** Un texto con una palabra larga sin cortes, como un correo o un enlace de verdad. */
const LARGO = ' info.reservas.estudio-de-pilates-del-barrio@example.invalid y otra frase bastante más larga de lo normal';

function alargar<T>(v: T): T {
  if (typeof v === 'string') return (v.includes(' ') ? v + LARGO : v) as T;
  if (Array.isArray(v)) return v.map(alargar) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, alargar(x)])) as T;
  return v;
}

async function sinDesbordePagina(page: Page, momento: string) {
  const d = await page.evaluate(() => {
    const ancho = window.innerWidth;
    const raiz = document.querySelector('[data-panel-pagina]') ?? document.body;
    const fuera: string[] = [];
    for (const el of Array.from(raiz.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= ancho + 1) continue;
      let p = el.parentElement;
      let dentroDeScroll = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') && p.getBoundingClientRect().right <= ancho + 1) { dentroDeScroll = true; break; }
        p = p.parentElement;
      }
      if (!dentroDeScroll) fuera.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')} → ${Math.round(r.right)}px`);
    }
    return { ancho, pagina: document.documentElement.scrollWidth, cuerpo: document.body.scrollWidth, escala: window.visualViewport?.scale ?? 1, fuera: fuera.slice(0, 8) };
  });
  expect(d.pagina, `${momento}: la página mide ${d.pagina}px en un iPhone de ${d.ancho}px`).toBeLessThanOrEqual(d.ancho);
  expect(d.cuerpo, `${momento}: el body se sale`).toBeLessThanOrEqual(d.ancho);
  expect(d.fuera, `${momento}: cajas que se salen por la derecha`).toEqual([]);
  expect(d.escala, `${momento}: la página no está ni ampliada ni alejada`).toBe(1);
}

const metaViewport = (page: Page) => page.locator('meta[name="viewport"]').first().getAttribute('content');

test('iPhone: el Centro de Control con textos largos y la barra, sin zoom posible al pulsarla ni con doble toque en el chat', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Es la prueba del iPhone: corre en el proyecto webkit-publico');
  await conAsistente(page);
  await page.route((u) => u.pathname === '/api/decisiones', (r) => json(r, alargar(DECISIONES)));

  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(LARGO.trim().split(' ')[0]).first(), 'los textos largos están pintados de verdad').toBeVisible({ timeout: 30_000 });
  await sinDesbordePagina(page, 'Centro de Control');
  expect(await metaViewport(page), 'en iOS la meta viewport lleva maximum-scale=1').toMatch(/maximum-scale=1\b/);
  await captura(page, 'centro-de-control-largo');

  await barra(page).click();
  await expect(page).toHaveURL(/\/asistente$/, { timeout: 30_000 });
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  await sinDesborde(page, '/asistente tras la barra');
  expect(await metaViewport(page), 'y la sigue llevando tras navegar').toMatch(/maximum-scale=1\b/);
  expect(await metaViewport(page), 'sin user-scalable=no: el pellizco no se toca').not.toMatch(/user-scalable/);

  // El doble toque: todo lo que hace scroll en el chat, y el campo, con `manipulation`.
  const toque = await page.evaluate(() => {
    const raiz = document.querySelector('[data-testid="chat-asistente"]')!;
    const conScroll = [raiz, ...Array.from(raiz.querySelectorAll('*'))].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX + getComputedStyle(e).overflowY));
    return {
      coarse: window.matchMedia('(pointer: coarse)').matches,
      contenedores: conScroll.length,
      sinManipulation: conScroll.filter((e) => getComputedStyle(e).touchAction !== 'manipulation').map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')}`),
    };
  });
  test.skip(!toque.coarse, 'Este WebKit no dice tener el puntero grueso: la regla no aplica');
  expect(toque.contenedores, 'el chat tiene contenedores con scroll (si no, esto no mide nada)').toBeGreaterThan(0);
  expect(toque.sinManipulation, 'ningún contenedor con scroll del chat deja el doble toque que amplía').toEqual([]);
  const campoToque = await campoChat(page).evaluate((el) => getComputedStyle(el).touchAction);
  expect(campoToque).toBe('manipulation');
});

test('Android: la meta viewport SIN maximum-scale (ahí sí quitaría el pellizco)', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Android es Chromium');
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  await conAsistente(page);
  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 60_000 });
  await barra(page).click();
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  const meta = await metaViewport(page);
  expect(meta).toMatch(/width=device-width/);
  expect(meta, 'en Android no se toca el zoom').not.toMatch(/maximum-scale|user-scalable/);
  await ctx.close();
});

// ── Fase 2: la tarjeta de confirmación en el iPhone ──
for (const tema of ['claro', 'oscuro'] as const) {
  test(`iPhone · ${tema}: la tarjeta de confirmación no desborda, con botones de 44 px y campo a 16 px`, async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Es la prueba del iPhone: corre en el proyecto webkit-publico');
    if (tema === 'oscuro') await enOscuro(page);
    const n = await conAcciones(page, { tipo: 'CREAR_CITA' });
    const tarjeta = await pedirAlAsistente(page);
    await sinDesborde(page, 'propuesta');
    for (const nombre of ['Confirmar', 'Cambiar algo', 'Cancelar']) {
      const caja = await tarjeta.getByRole('button', { name: nombre }).boundingBox();
      expect(caja?.height, `${nombre} mide al menos 44 px`).toBeGreaterThanOrEqual(44);
    }
    const tamano = await campoChat(page).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(tamano).toBeGreaterThanOrEqual(16);
    await captura(page, `${tema}-accion-propuesta`);
    await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
    await expect(tarjeta.getByText('Creada', { exact: true }).first()).toBeVisible();
    expect(n.acc.confirmar).toBeGreaterThan(0);
    await sinDesborde(page, 'creada');
    await captura(page, `${tema}-accion-creada`);
  });
}
