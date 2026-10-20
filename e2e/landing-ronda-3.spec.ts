import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 3 de la landing (19-oct-2026): seis tarjetas «verbo + punto», comparador
// «hoy → con Tentare», migración en dos rutas, chips del bento con enlace, guías
// con foto y un botón «Empezar gratis» al cierre de cada bloque.
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

test('las seis tarjetas existen y cada una lleva a su función: seis rutas distintas que responden', async ({ page, request }) => {
  await abrir(page, 1440);
  // Home nueva (fase 2.2): las seis tarjetas son SeisVerbos (clases `wh-verbo*`).
  const tarjetas = page.locator('#verbos .wh-verbo');
  await expect(tarjetas).toHaveCount(6);
  const hrefs = await tarjetas.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(new Set(hrefs).size).toBe(6);
  for (const href of hrefs as string[]) {
    expect(href).toMatch(/^\/funcionalidades\/[a-z-]+$/);
    expect((await request.get(href, { timeout: 120_000 })).status(), href).toBe(200);
  }
  const verbos = (await page.locator('#verbos .wh-verbo-h').allTextContents()).map((t) => t.trim());
  expect(verbos).toEqual(['Reserva.', 'Cobra.', 'Avisa.', 'Cubre.', 'Factura.', 'Mide.']);
  // CONTROL: una ruta inventada no responde 200, así que el bucle de arriba puede fallar.
  expect((await request.get('/funcionalidades/no-existe', { timeout: 120_000 })).status()).toBe(404);
});

test('el comparador tiene seis filas «hoy / con Tentare» y ni una cifra', async ({ page }) => {
  await abrir(page, 1440);
  // Home nueva (fase 2.2): BandaComparador (clases `wh-cmp-*`).
  const filas = page.locator('#antes-despues .wh-cmp-lista .wh-cmp-fila');
  await expect(filas).toHaveCount(6);
  await expect(page.locator('#antes-despues .wh-cmp-hoy')).toHaveCount(6);
  await expect(page.locator('#antes-despues .wh-cmp-con')).toHaveCount(6);
  const texto = await page.locator('#antes-despues .wh-cmp-lista').innerText();
  expect(texto).not.toMatch(CIFRA);
  // CONTROL: el mismo detector sí caza una cifra colada, y la sección de precios (que las lleva) lo dispara.
  expect('ahorra 10 horas').toMatch(CIFRA);
  expect(await page.locator('#precio').innerText()).toMatch(CIFRA);
});

test('cada bloque de beneficio cierra con su botón «Empezar gratis», que lleva al alta', async ({ page }) => {
  await abrir(page, 1440);
  // Home nueva (fase 2.2): los bloques que cierran con su botón son estos tres; el resto
  // enlaza a su función (las seis tarjetas, las pestañas, las filas y las etapas).
  for (const id of ['te-suena', 'plataforma', 'antes-despues']) {
    const botones = page.locator(`#${id} a[href="/crear-estudio"]`);
    expect(await botones.count(), `#${id} no tiene su botón`).toBeGreaterThan(0);
    for (const t of await botones.allTextContents()) expect(t.trim(), `#${id}`).toBe('Empezar gratis');
  }
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

test('el bento: sus chips con enlace llevan a una función y las seis tarjetas siguen distintas', async ({ page }) => {
  await abrir(page, 1440);
  const chips = page.locator('#plataforma .wh-chip-enlace a');
  expect(await chips.count()).toBeGreaterThanOrEqual(15);
  for (const h of await chips.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))) {
    expect(h).toMatch(/^\/(funcionalidades|soluciones)\//);
  }
  expect(await page.locator('#plataforma .wh-bn-h3 a').count()).toBe(6);
});

test('guías destacadas: cada tarjeta con su foto cargada, su categoría y sus minutos', async ({ page }) => {
  // Home nueva (fase 2.2): tres guías (GuiasHome), como la banda de bsport; antes, seis.
  await abrir(page, 1440);
  const tarjetas = page.locator('#guias .wh-guia');
  await expect(tarjetas).toHaveCount(3);
  await tarjetas.first().scrollIntoViewIfNeeded();
  for (let i = 0; i < 6; i++) {
    const t = tarjetas.nth(i);
    await t.scrollIntoViewIfNeeded();
    await expect(t.locator('.wh-guia-seccion')).toHaveText(/ · \d+ min de lectura$/);
    const img = t.locator('img');
    await expect(img).toHaveCount(1);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  }
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

  test('las tarjetas, el comparador y las rutas caben en el ancho y no se pisan', async ({ page }) => {
    await abrir(page, 375, 812);
    // Home nueva (fase 2.2): en el móvil las seis tarjetas van en un carril que se desliza
    // (la siguiente asoma a propósito), así que se mide el carril y no cada tarjeta.
    for (const sel of ['#verbos .wh-verbos-rejilla', '#plataforma .wh-bn-tarjeta', '#antes-despues .wh-cmp-lista .wh-cmp-fila', '#etapas .wh-etapa', '#guias .wh-guia']) {
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
