import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La «isla» de la landing: la barra flotante de cristal.
//
// Al BAJAR se encoge (logo + botón), al SUBIR se alarga, y cerca del tope está
// siempre completa. Lo que fija esta spec es lo que un test unitario no ve
// porque depende del navegador de verdad: que el oyente de scroll lo dispare,
// que el ancho cambie, que los enlaces plegados salgan del orden de tabulación,
// que encoger no mueva nada de la página (CLS 0) y que con «reducir movimiento»
// no haya transición. Las reglas del umbral están en lib/landing/isla-scroll.test.ts.
//
// Pública y la sufre quien llega de Google desde el móvil: corre también en
// WebKit-iPhone (proyecto webkit-publico).
// ─────────────────────────────────────────────────────────────────────────────

const isla = (page: Page) => page.locator('nav.v5-nav');

async function prepararPagina(page: Page) {
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(isla(page)).toBeVisible();
}

/** Baja en escalones, como una rueda o un dedo: cada uno es un evento de scroll real. */
async function desplazar(page: Page, desde: number, hasta: number) {
  const paso = hasta > desde ? 40 : -40;
  for (let y = desde; paso > 0 ? y < hasta : y > hasta; y += paso) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
  await page.evaluate((v) => window.scrollTo(0, v), hasta);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

const ancho = async (page: Page) => (await isla(page).boundingBox())?.width ?? 0;

test.describe('La isla de la landing', () => {
  test('arriba del todo está completa: enlaces y «Entrar» a la vista', async ({ page }, info) => {
    await prepararPagina(page);
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
    await expect(page.getByRole('link', { name: 'Probar Tentare' })).toBeVisible();
    // En móvil los enlaces viven en el menú; en escritorio, en la isla.
    if ((info.project.use.viewport?.width ?? 1280) > 760) {
      await expect(isla(page).getByRole('link', { name: 'Precios' })).toBeVisible();
    }
  });

  test('al bajar se encoge y al subir se alarga', async ({ page }, info) => {
    await prepararPagina(page);
    const escritorio = (info.project.use.viewport?.width ?? 1280) > 760;
    const anchoCompleta = await ancho(page);
    // Con movimiento normal sí hay resorte: la rejilla del envoltorio tarda más de 0,3 s.
    const largo = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('nav.v5-nav .v5-nav-col') as Element).transitionDuration));
    expect(largo).toBeGreaterThan(0.3);

    await desplazar(page, 0, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    if (escritorio) {
      await expect.poll(() => ancho(page), { message: 'la isla encogida mide menos' }).toBeLessThan(anchoCompleta - 100);
      // Los enlaces plegados no se pueden tabular ni leer: no están.
      await expect(isla(page).getByRole('link', { name: 'Precios' })).toBeHidden();
    }
    await expect(page.getByRole('link', { name: 'Probar Tentare' })).toBeVisible();

    await desplazar(page, 900, 840);
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
    if (escritorio) {
      await expect.poll(() => ancho(page)).toBeGreaterThan(anchoCompleta - 4);
      await expect(isla(page).getByRole('link', { name: 'Precios' })).toBeVisible();
    }
  });

  test('un temblor corto al bajar no la encoge', async ({ page }) => {
    await prepararPagina(page);
    await desplazar(page, 0, 300);
    // Ya en 300 con la isla encogida por el salto; subimos para dejarla completa y probamos el temblor.
    await desplazar(page, 300, 240);
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
    await desplazar(page, 240, 260);
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
  });

  test('encogerse no mueve nada de la página (el alto de la barra no cambia)', async ({ page }) => {
    await prepararPagina(page);
    const alto = async () => (await isla(page).boundingBox())?.height ?? 0;
    const posicionHeroe = () => page.evaluate(() => (document.querySelector('#te-suena') as HTMLElement).offsetTop);
    const altoAntes = await alto();
    const antes = await posicionHeroe();
    await desplazar(page, 0, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    await expect.poll(alto).toBe(altoAntes);
    expect(await posicionHeroe()).toBe(antes);
  });

  test('con «reducir movimiento» no hay transición de ancho, pero sigue encogiéndose', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepararPagina(page);
    // Ninguna transición dura más de un milisegundo (el reset global de
    // reduced-motion la deja en 1e-05 s, que es «ninguna»).
    const duracion = () => page.evaluate(() => {
      const d = getComputedStyle(document.querySelector('nav.v5-nav .v5-nav-col') as Element).transitionDuration;
      return Math.max(...d.split(',').map((t) => parseFloat(t) * (t.trim().endsWith('ms') ? 0.001 : 1)));
    });
    expect(await duracion()).toBeLessThan(0.001);
    await desplazar(page, 0, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    expect(await duracion()).toBeLessThan(0.001);
    if ((info.project.use.viewport?.width ?? 1280) > 760) {
      // Sin animación el ancho final se alcanza ya, sin esperar un resorte.
      const final = await ancho(page);
      await page.waitForTimeout(100);
      expect(await ancho(page)).toBe(final);
    }
  });

  test('con teclado, tabular hacia la isla la alarga', async ({ page }) => {
    await prepararPagina(page);
    await desplazar(page, 0, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    await page.keyboard.press('Tab');
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
  });

  test('el menú móvil abre y cierra también con la isla encogida', async ({ page }, info) => {
    test.skip((info.project.use.viewport?.width ?? 1280) > 760, 'el botón del menú solo existe en móvil');
    await prepararPagina(page);
    await desplazar(page, 0, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    await page.getByRole('button', { name: 'Abrir el menú' }).click();
    await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar el menú' }).click();
    await expect(page.getByRole('dialog', { name: 'Menú' })).toBeHidden();
  });
});
