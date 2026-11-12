import { test, expect } from '@playwright/test';

// La MAQUETA del diseño de Figma (/landing-figma): una ruta interna, sin publicar. Lo que se fija aquí es que sigue siendo
// una maqueta aislada y bien hecha: noindex, fuera del sitemap, sin desbordes y sin texto que prometa lo que Tentare no hace.
for (const [nombre, ancho, alto] of [['móvil', 390, 844], ['tableta', 820, 1180], ['escritorio', 1440, 900]] as const) {
  test(`${nombre}: la maqueta se ve completa, en español y sin desbordes`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    const r = await page.goto('/landing-figma', { waitUntil: 'load' });
    expect(r?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Software de gestión para estudios de Pilates y yoga Tu estudio sigue funcionando aunque sueltes el móvil.');
    for (const sel of ['.lf-heroe', '#funciones', '.lf-beneficios', '.lf-cta', '#precios', '#faq', '#contacto', '.lf-pie']) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'se sale de lado').toBeLessThanOrEqual(0);
  });
}

test('cabecera: logotipo oficial y navegación exacta (sin «Sobre nosotros»)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/landing-figma', { waitUntil: 'load' });
  // El logotipo es el SVG en línea de <LogoTentare> (no una imagen ni texto) y lleva al inicio.
  await expect(page.locator('.lf-cabecera a.lf-marca svg.t-logo')).toBeVisible();
  const enlaces = await page.locator('.lf-cabecera .lf-menu a').allInnerTexts();
  expect(enlaces).toEqual(['Inicio', 'Producto', 'Precios', 'Soluciones']);
  expect((await page.locator('.lf').innerText()).toLowerCase()).not.toContain('sobre nosotros');
  await expect(page.getByRole('link', { name: 'Empezar gratis' }).first()).toHaveAttribute('href', '/crear-estudio');
});

test('cabecera: al bajar se encoge a logo + botón y al subir se alarga', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/landing-figma', { waitUntil: 'load' });
  const barra = page.locator('.lf-cabecera-barra');
  // El oyente de scroll lo pone React al hidratar: hasta entonces la rueda no hace nada.
  await page.waitForFunction(() => Object.keys(document.querySelector('.lf-hamburguesa') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  await expect(barra).not.toHaveAttribute('data-compacta', /.*/);
  const ancho = async () => (await barra.boundingBox())!.width;
  const abierta = await ancho();
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 250); await page.waitForTimeout(120); }
  await expect(barra).toHaveAttribute('data-compacta', '');
  await expect.poll(ancho).toBeLessThan(abierta * 0.6);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -250); await page.waitForTimeout(120); }
  await expect(barra).not.toHaveAttribute('data-compacta', /.*/);
  await expect.poll(ancho).toBeGreaterThan(abierta * 0.95);
});

test('móvil: el menú abre, se cierra con Esc y las fotos del escritorio cargan', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/landing-figma', { waitUntil: 'load' });
  await page.waitForFunction(() => Object.keys(document.querySelector('.lf-hamburguesa') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal (móvil)' }).getByRole('link', { name: 'Soluciones' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir el menú' })).toHaveAttribute('aria-expanded', 'false');
  // Todas las fotos (alumnas, cobros, postura, meditación, retrato, hierba, panel) salen de public/landing-nueva y cargan.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
  // Con la máquina cargada (tests en paralelo) las fotos tardan: se espera a que carguen en vez de mirar una sola vez.
  await expect.poll(() => page.$$eval('.lf picture img', ims => ims.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.currentSrc || i.src)), { message: 'fotos que no cargan', timeout: 30_000 }).toEqual([]);
  expect(await page.$$eval('.lf picture img', ims => ims.length)).toBeGreaterThanOrEqual(9);
  expect(errores).toEqual([]);
});

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
