import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Founding Studio GRATIS en la web (decisión del fundador, 15-oct-2026).
//
// /precios y la sección de precio de la home dicen lo mismo: Founding Studio
// «Gratis» con sus dos límites (150 alumnas activas y 30 cobros al mes), con
// más cobros 29 €/mes, la frase del fundador al lado, el botón «Empezar gratis»
// y ni rastro de la prueba de 7 días. El schema.org de las dos páginas (la misma entidad, el mismo `@id`)
// da precio 0 a Founding Studio. Con PRECIOS_CAPTURAS=<carpeta> guarda capturas
// a 1440 y a 375 de ancho.
// ─────────────────────────────────────────────────────────────────────────────

const FRASE = 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.';

async function abrir(page: Page, url: string) {
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    if (!localStorage.getItem('tentare:intro-vista')) localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
}

/** Las ofertas del SoftwareApplication de la página, por nombre de plan. */
async function ofertas(page: Page): Promise<Record<string, { price: number; description: string }>> {
  const bloques = await page.locator('script[type="application/ld+json"]').allTextContents();
  for (const b of bloques) {
    const ld = JSON.parse(b);
    if (ld['@type'] === 'SoftwareApplication' && Array.isArray(ld.offers)) {
      return Object.fromEntries(ld.offers.map((o: { name: string; price: number; description: string }) => [o.name, o]));
    }
  }
  throw new Error('sin SoftwareApplication con ofertas');
}

for (const [nombre, ancho, alto] of [['escritorio', 1440, 900], ['movil', 375, 812]] as const) {
  test(`/precios: Founding Studio gratis, con sus límites y la frase · ${nombre}`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrir(page, '/precios');

    const main = page.locator('body');
    await expect(main).toContainText('Gratis');
    await expect(main).toContainText('Hasta 30 cobros al mes · con más cobros, 29 €/mes');
    await expect(main).toContainText('Hasta 150 alumnas activas');
    await expect(main.getByText(FRASE)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Empezar gratis' }).first()).toHaveAttribute('href', '/crear-estudio');
    await expect(main).not.toContainText('días gratis');

    // La tabla de planes: Founding Studio con todo menos varias sedes y la fila de cobros.
    await expect(main).toContainText('Cobros al mes');

    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(desborda).toBe(false);

    const carpeta = process.env.PRECIOS_CAPTURAS;
    if (carpeta) {
      await page.locator('.pre-grid').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${carpeta}/precios-${nombre}.png` });
      await page.screenshot({ path: `${carpeta}/precios-${nombre}-entera.png`, fullPage: true });
    }
  });

  test(`home: la sección de precio dice lo mismo · ${nombre}`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrir(page, '/');

    const precio = page.locator('#precio');
    await precio.scrollIntoViewIfNeeded();
    await expect(precio).toContainText('Gratis');
    await expect(precio).toContainText('Hasta 150 alumnas activas y 30 cobros al mes; con más cobros, 29 €/mes');
    await expect(precio.getByText(FRASE)).toBeVisible();
    await expect(precio).not.toContainText('días gratis');
    await expect(page.locator('body')).not.toContainText('7 días gratis');

    const carpeta = process.env.PRECIOS_CAPTURAS;
    if (carpeta) {
      await precio.screenshot({ path: `${carpeta}/home-precio-${nombre}.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${carpeta}/home-arriba-${nombre}.png` });
    }
  });
}

test('el schema.org de la home y el de /precios dan lo mismo: Founding Studio a 0 €', async ({ page }) => {
  await abrir(page, '/precios');
  const enPrecios = await ofertas(page);
  await abrir(page, '/');
  const enHome = await ofertas(page);

  expect(enPrecios).toEqual(enHome);
  expect(enHome['Founding Studio'].price).toBe(0);
  expect(enHome['Founding Studio'].description).toContain('150 alumnas activas y 30 cobros al mes; con más cobros, 29 €/mes');
  expect(enHome['Estudio'].price).toBe(59);
  expect(enHome['Cadena'].price).toBe(149);
  for (const o of Object.values(enHome)) expect(o.description).not.toMatch(/prueba/i);
});
