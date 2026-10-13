import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La banda de la home: «7 días gratis, sin tarjeta · Migración incluida».
//
// SOLO la ve quien llega por el enlace del anuncio de Meta (`utm_source=meta`);
// la landing normal no la lleva. Pública y la sufre quien llega de un anuncio
// desde el móvil. Lo que fija esta spec es lo que un test unitario no ve: que se
// pinte con el enlace del anuncio, que NO se pinte sin él, que se recuerde en la
// sesión, que no sea un popup (ni diálogo, ni fija sobre la página) y que en
// móvil no haga scroll horizontal. Con BANDA_CAPTURAS=<carpeta> guarda capturas.
// La regla está en lib/landing/banda-prueba-reglas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const ENLACE_ANUNCIO = '/?utm_source=meta&utm_medium=paid_social&utm_campaign=alta_prueba_reel_b&utm_content=llenar_horas_v1';

async function abrir(page: Page, url: string) {
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    if (!localStorage.getItem('tentare:intro-vista')) localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
}

const banda = (page: Page) => page.locator('.v5-banda');

for (const [nombre, ancho, alto] of [['movil', 390, 844], ['escritorio', 1280, 800]] as const) {
  test(`con el enlace del anuncio se ve la banda, y no es un popup · ${nombre}`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrir(page, ENLACE_ANUNCIO);

    await expect(banda(page)).toBeVisible();
    await expect(banda(page)).toContainText(/7 días gratis, sin tarjeta/);
    await expect(banda(page)).toContainText(/Migración incluida, sin coste aparte/);
    await expect(banda(page).getByRole('link', { name: /Empezar/ })).toHaveAttribute('href', '/crear-estudio');

    // No es un popup: ni diálogo, ni fija sobre la página, y la portada sigue ahí.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const posicion = await banda(page).evaluate((el) => getComputedStyle(el).position);
    expect(posicion).not.toBe('fixed');
    expect(posicion).not.toBe('sticky');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // En móvil, sin scroll horizontal.
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(desborda).toBe(false);

    const carpeta = process.env.BANDA_CAPTURAS;
    if (carpeta) await page.screenshot({ path: `${carpeta}/banda-anuncio-${nombre}.png` });
  });
}

test('la landing normal NO lleva la banda: directo, buscador o enlace sin utm de Meta', async ({ page }) => {
  for (const url of ['/', '/?utm_source=google', '/?fbclid=abc123', '/?utm_medium=paid_social']) {
    await abrir(page, url);
    await expect(banda(page), `no debe haber banda en ${url}`).toHaveCount(0);
  }
  const carpeta = process.env.BANDA_CAPTURAS;
  if (carpeta) {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrir(page, '/');
    await page.screenshot({ path: `${carpeta}/banda-landing-normal-movil.png` });
  }
});

test('quien vino del anuncio la sigue viendo si navega y vuelve a la portada sin el utm', async ({ page }) => {
  await abrir(page, ENLACE_ANUNCIO);
  await expect(banda(page)).toBeVisible();
  await page.goto('/precios');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(banda(page)).toBeVisible();

  // …pero en otra sesión (otra pestaña sin sessionStorage) la landing normal sigue limpia.
  const otra = await page.context().newPage();
  await abrir(otra, '/');
  await expect(banda(otra)).toHaveCount(0);
});
