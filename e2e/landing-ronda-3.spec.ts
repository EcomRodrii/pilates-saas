import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 3 de la landing (19-oct-2026), rehecha con la home v2 (20-oct): las seis
// tarjetas, el comparador, el bento y las guías salieron (decían lo mismo que las
// pestañas); quedan el producto por áreas, «Un día cualquiera», las etapas y el
// botón «Empezar gratis» al cierre del bloque de beneficio.
//
// Lo que fija esta spec es lo que un test unitario no ve porque depende del
// navegador: que el HTML pintado lleve lo que los datos dicen, que no haya scroll
// lateral a 375 px, que el botón principal siga sobre el pliegue del móvil y que
// la página no se desplace al cargar.
//
// ⚠️ Cada test lleva su control (lo que cambia al otro lado): una comprobación que
// no puede fallar no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

async function abrir(page: Page, ancho: number, alto = 900) {
  await page.setViewportSize({ width: ancho, height: alto });
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
}

/** Cifra, porcentaje o importe en un texto. */
const CIFRA = /[0-9]|%|€/;

test('el producto por áreas: cada pestaña lleva a su función, cinco rutas distintas que responden', async ({ page, request }) => {
  await abrir(page, 1440);
  // Home v2 (20-oct-2026): las seis tarjetas, el bento y el comparador salieron; el
  // producto se recorre en las pestañas (PestanasProducto), una función por pestaña.
  const hrefs = await page.locator('#funcionalidades a.wh-enlace-flecha').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(hrefs).toHaveLength(5);
  expect(new Set(hrefs).size).toBe(5);
  for (const href of hrefs as string[]) {
    expect(href).toMatch(/^\/funcionalidades\/[a-z-]+$/);
    expect((await request.get(href, { timeout: 120_000 })).status(), href).toBe(200);
  }
  // CONTROL: una ruta inventada no responde 200, así que el bucle de arriba puede fallar.
  expect((await request.get('/funcionalidades/no-existe', { timeout: 120_000 })).status()).toBe(404);
});

test('«Un día cualquiera»: cuatro momentos con su verbo, su foto cargada y ni una cifra', async ({ page }) => {
  await abrir(page, 1440);
  const tarjetas = page.locator('#momentos .wh-mom-tarjeta');
  await expect(tarjetas).toHaveCount(4);
  expect((await page.locator('#momentos .wh-mom-verbo').allTextContents()).map((t) => t.trim())).toEqual(['Reserva.', 'Repite.', 'Cubre.', 'Cobra.']);
  for (let i = 0; i < 4; i++) {
    const img = tarjetas.nth(i).locator('img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).not.toHaveAttribute('alt', '');
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  }
  // «A las siete de la mañana» va en letra: una cifra sería una promesa medida que no tenemos.
  expect(await page.locator('#momentos').innerText()).not.toMatch(CIFRA);
  // CONTROL: el mismo detector sí caza una cifra, y la sección de precios (que las lleva) lo dispara.
  expect('ahorra 10 horas').toMatch(CIFRA);
  expect(await page.locator('#precio').innerText()).toMatch(CIFRA);
});

test('el bloque de beneficio cierra con su botón «Empezar gratis», que lleva al alta', async ({ page }) => {
  await abrir(page, 1440);
  const botones = page.locator('#te-suena a[href="/crear-estudio"]');
  expect(await botones.count(), '#te-suena no tiene su botón').toBeGreaterThan(0);
  for (const t of await botones.allTextContents()) expect(t.trim()).toBe('Empezar gratis');
  // CONTROL: un bloque sin botón da cero, así que el contador distingue.
  expect(await page.locator('#faq a[href="/crear-estudio"]').count()).toBe(0);
});

test('etapas: las tres puertas (abrir, cambiar, varias sedes) llevan a páginas que existen, con las comparativas', async ({ page, request }) => {
  // Home nueva (fase 2.2): la migración en dos rutas vive en /soluciones/cambiar-de-software;
  // la home lleva ahí desde la etapa «quiero cambiar», con las comparativas al lado.
  await abrir(page, 1440);
  const seccion = page.locator('#etapas');
  await expect(seccion.locator('.wh-etapa')).toHaveCount(3);
  const hrefs = await seccion.locator('h3 a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(hrefs).toEqual(['/recursos/como-abrir-un-estudio-de-pilates', '/soluciones/cambiar-de-software', '/funcionalidades/multi-centro']);
  for (const h of hrefs as string[]) expect((await request.get(h, { timeout: 120_000 })).status(), h).toBe(200);
  await expect(seccion.locator('a[href^="/comparativa/tentare-vs-"]')).toHaveCount(6);
  // CONTROL: una ruta inventada no responde 200.
  expect((await request.get('/soluciones/no-existe', { timeout: 120_000 })).status()).toBe(404);
});

test.describe('móvil · 375 × 812', () => {
  test('sin scroll horizontal y con el botón principal sobre el pliegue', async ({ page }) => {
    await abrir(page, 375, 812);
    const ancho = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    const medida = await ancho();
    expect(medida.sw, 'la página se sale de lado').toBeLessThanOrEqual(medida.iw);
    // Recorrida entera (los bloques que entran con scroll no pueden ensancharla).
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < alto; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); }
    expect((await ancho()).sw).toBeLessThanOrEqual(medida.iw);
    await page.evaluate(() => window.scrollTo(0, 0));
    const caja = await page.locator('.v5-hero-cta').boundingBox();
    expect(caja, 'no hay botón del héroe').not.toBeNull();
    expect(caja!.y + caja!.height, 'el botón principal queda bajo el pliegue').toBeLessThanOrEqual(812);
    // CONTROL: un elemento ancho SÍ provoca scroll lateral, así que la medición no es hueca.
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ancho-control'; d.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:4px'; document.body.appendChild(d); });
    const roto = await ancho();
    expect(roto.sw).toBeGreaterThan(roto.iw);
  });

  test('los momentos, las etapas y los planes caben en el ancho y no se pisan', async ({ page }) => {
    await abrir(page, 375, 812);
    for (const sel of ['#te-suena .wh-contenedor', '#momentos .wh-mom-tarjeta', '#etapas .wh-etapa', '#precio .wh-plan']) {
      const cajas = await page.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width }; }));
      expect(cajas.length, sel).toBeGreaterThan(0);
      for (const c of cajas) {
        expect(c.x, sel).toBeGreaterThanOrEqual(-1);
        expect(c.x + c.w, sel).toBeLessThanOrEqual(375 + 1);
      }
    }
  });

  test('la página no se desplaza al cargar ni al recorrerla (CLS ≈ 0)', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await abrir(page, 375, 812);
    await page.waitForLoadState('load');
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < alto; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls, `CLS ${cls}`).toBeLessThan(0.01);
  });
});
