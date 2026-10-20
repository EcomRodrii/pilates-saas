import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// La cabecera es `position: fixed`, así que NO hereda el ancho del shell: lo
// tiene que copiar. Iba con un 1040 fijo y 18 px de margen, y el shell escala
// 560 → 640 (≥768) → 1040 (≥1024) con 24 px de margen desde 768. Resultado:
//
//  · En tableta y móvil apaisado, el logo y la campana quedaban FUERA del
//    contenido de la página, y el velo sobre la foto de Inicio cruzaba los
//    márgenes crema (el nombre del estudio, en crema, encima del crema).
//  · A 1280, el logo iba 6 px a la izquierda del título de cada pantalla.
//
// Se mide en las tres anchuras donde cambia algo. Y de paso, la ✕ nativa del
// campo de búsqueda, que Chrome pintaba al lado de la nuestra. Desde la maqueta
// de oct-2026 la cabecera ya no flota sobre ninguna foto.

const base = `/portal/${SLUG}`;

async function caja(page: Page, selector: ReturnType<Page['locator']>) {
  const b = await selector.first().boundingBox();
  if (!b) throw new Error('sin caja');
  return b;
}

for (const [ancho, alto] of [[600, 900], [768, 1024], [1280, 860]] as const) {
  test.describe(`Student PWA · cabecera alineada con la página a ${ancho} px`, () => {
    test.use({ viewport: { width: ancho, height: alto } });
    test.describe.configure({ timeout: 120_000 });

    test('el logo empieza donde empieza el título de la pantalla', async ({ page }) => {
      await sembrarSociaCompleta(page, { bono: 5 });
      // Actividad: lleva la barra del estudio y un título (Reservar y Mi plan van sin ella, como en la maqueta).
      await page.goto(`${base}/mis-reservas`);
      const titulo = page.getByRole('heading', { name: 'Actividad', exact: true });
      await expect(titulo).toBeVisible({ timeout: 30_000 });
      const logo = await caja(page, page.locator('header a'));
      const h1 = await caja(page, titulo);
      expect(Math.abs(logo.x - h1.x), `logo en ${logo.x}, título en ${h1.x}`).toBeLessThanOrEqual(1.5);
      // ⚠️ Y el título con el CONTENIDO. Sin esto el test pasaba a 1280 con los
      // dos mal: `PageHeader` pisaba `.px` con 18 px fijos, así que logo y título
      // coincidían entre sí y quedaban 6 px a la izquierda de las tarjetas.
      const pestanas = await caja(page, page.getByRole('tablist', { name: 'Actividad' }));
      expect(Math.abs(h1.x - pestanas.x), `título en ${h1.x}, contenido en ${pestanas.x}`).toBeLessThanOrEqual(1.5);
    });

    test('en Inicio, el logo empieza donde empieza el saludo', async ({ page }) => {
      await sembrarSociaCompleta(page, { bono: 5 });
      await page.goto(base);
      const hola = page.getByRole('heading', { name: /^Hola/ });
      await expect(hola).toBeVisible({ timeout: 30_000 });
      const logo = await caja(page, page.locator('header a'));
      const h = await caja(page, hola);
      expect(Math.abs(logo.x - h.x), `logo en ${logo.x}, saludo en ${h.x}`).toBeLessThanOrEqual(1.5);
    });
  });
}

test('el campo de búsqueda no pinta la ✕ nativa junto a la nuestra', async ({ page }) => {
  await sembrarSociaCompleta(page, { bono: 5 });
  await page.goto(`${base}/reservar`);
  // El buscador vive en la hoja de filtros (maqueta de oct-2026).
  await page.getByTestId('abrir-filtros').click({ timeout: 30_000 });
  const campo = page.getByRole('searchbox').first();
  await expect(campo).toBeVisible({ timeout: 30_000 });
  // ⚠️ No con `getComputedStyle(el, '::-webkit-search-cancel-button')`: Chrome no
  // expone ese pseudoelemento y devuelve el estilo del propio campo («auto»), así
  // que esa medida fallaba CON el arreglo y habría fallado sin él. Se comprueba lo
  // que de verdad decide: que hay una regla servida que le quita la apariencia
  // al botón nativo de ESTE campo.
  const oculta = await campo.evaluate((el) => {
    const PSEUDO = '::-webkit-search-cancel-button';
    const recorrer = (reglas: CSSRuleList): boolean => Array.from(reglas).some((r) => {
      if (r instanceof CSSStyleRule && r.selectorText.includes(PSEUDO)) {
        const apariencia = r.style.getPropertyValue('-webkit-appearance') || r.style.getPropertyValue('appearance');
        const bases = r.selectorText.split(',').map((s) => s.trim()).filter((s) => s.includes(PSEUDO)).map((s) => s.replace(PSEUDO, ''));
        if (apariencia === 'none' && bases.some((b) => el.matches(b))) return true;
      }
      return 'cssRules' in r ? recorrer((r as CSSGroupingRule).cssRules) : false;
    });
    return Array.from(document.styleSheets).some((hoja) => {
      try { return recorrer(hoja.cssRules); } catch { return false; }
    });
  });
  expect(oculta, 'ninguna regla servida quita la ✕ nativa de este campo').toBe(true);
});
