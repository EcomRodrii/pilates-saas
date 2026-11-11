import { test, expect } from '@playwright/test';

// La MAQUETA del diseño de Figma (/landing-figma): una ruta interna, sin publicar. Lo que se fija aquí es que sigue siendo
// una maqueta aislada y bien hecha: noindex, fuera del sitemap, sin desbordes y sin texto que prometa lo que Tentare no hace.
for (const [nombre, ancho, alto] of [['móvil', 390, 844], ['tableta', 820, 1180], ['escritorio', 1440, 900]] as const) {
  test(`${nombre}: la maqueta se ve completa, en español y sin desbordes`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    const r = await page.goto('/landing-figma', { waitUntil: 'load' });
    expect(r?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu estudio, con el acabado de un producto premium.');
    for (const sel of ['.lf-heroe', '#funciones', '.lf-beneficios', '.lf-cta', '#precios', '#faq', '#contacto', '.lf-pie']) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'se sale de lado').toBeLessThanOrEqual(0);
  });
}

test('⚠️ copy: nada de sustituciones ni de marcas ajenas, y el formulario avisa de que no envía', async ({ page }) => {
  await page.goto('/landing-figma', { waitUntil: 'load' });
  // El formulario es un componente de cliente: hasta que hidrata, enviar recargaría la página. Se espera a que esté vivo.
  await page.waitForFunction(() => Object.keys(document.querySelector('form.lf-form') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  const texto = (await page.locator('main').innerText()).toLowerCase();
  expect(texto).not.toMatch(/sustitu|baja cubierta|nike|adidas|puma|gucci|zara/);
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba');
  await page.getByRole('button', { name: 'Pedir una demo' }).last().click();
  await expect(page.getByText('Maqueta: el formulario aún no envía nada.')).toBeVisible();
});

test('sigue aislada: noindex, fuera del sitemap y bloqueada en robots', async ({ page, request }) => {
  await page.goto('/landing-figma', { waitUntil: 'domcontentloaded' });
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/noindex/);
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('landing-figma');
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow:\s*\/landing-figma/);
});
