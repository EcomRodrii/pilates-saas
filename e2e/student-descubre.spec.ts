import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// «Descubre» en la home de la alumna. Pinta `contenido_portal_banners`, la
// tabla que se quedó huérfana al borrar el portal viejo (#1591).

const base = `/portal/${SLUG}`;

test.describe('Student PWA · Descubre', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('sin tarjetas publicadas, la sección no existe', async ({ page }) => {
    // Es el caso por defecto: contenido OPCIONAL del estudio. Un estado vacío
    // aquí le diría a la alumna que le falta algo suyo, y no le falta nada.
    await sembrarSociaCompleta(page, { descubre: 0 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);
    await expect(page.getByTestId('descubre')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Descubre' })).toHaveCount(0);
  });

  test('con tarjetas: se pintan en orden y con su enlace', async ({ page }) => {
    await sembrarSociaCompleta(page, { descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);

    const seccion = page.getByTestId('descubre');
    await expect(seccion).toBeVisible();
    await expect(seccion.locator('li')).toHaveCount(3);

    // Orden: el que manda es `orden`, no el que llegue antes en el array.
    await expect(seccion.locator('li').nth(0)).toContainText('Nuevas clases');
    await expect(seccion.locator('li').nth(1)).toContainText('Bienestar fuera del estudio');

    // Interno: se le pone el prefijo del estudio, que la fila no lleva.
    await expect(seccion.locator('a[href$="/reservar"]').first()).toHaveAttribute('href', `${base}/reservar`);
    // Externo: pestaña nueva y sin `opener`.
    const fuera = seccion.locator('a[href^="https://estudio.example"]');
    await expect(fuera).toHaveAttribute('target', '_blank');
    await expect(fuera).toHaveAttribute('rel', /noopener/);
  });

  test('cada tarjeta es una foto ancha 16:9 y deja asomar la siguiente; el botón solo donde hay destino', async ({ page }) => {
    await sembrarSociaCompleta(page, { descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);

    const seccion = page.getByTestId('descubre');
    await seccion.scrollIntoViewIfNeeded();
    const lis = seccion.locator('li');
    const p = await lis.nth(0).boundingBox();
    const s = await lis.nth(1).boundingBox();
    expect(p && s, 'no se pudieron medir las tarjetas').toBeTruthy();
    // 16:9, y de ancho la pantalla menos los márgenes (18 + 18) y los 40 px que dejan ver la siguiente.
    expect(p!.width / p!.height).toBeCloseTo(16 / 9, 1);
    expect(p!.width).toBeCloseTo(393 - 36 - 40, -1);
    // La siguiente empieza dentro de la pantalla y termina fuera: «hay más» sin decirlo.
    expect(s!.x).toBeLessThan(393);
    expect(s!.x + s!.width).toBeGreaterThan(393);

    // «Ver más» solo si lleva a alguna parte: la tercera tarjeta no tiene destino válido.
    await expect(lis.nth(0)).toContainText('Ver más');
    await expect(lis.nth(1)).toContainText('Ver más');
    await expect(lis.nth(2)).not.toContainText('Ver más');
  });

  test('con la letra grande del iPhone y una pantalla estrecha la tarjeta CRECE: nunca se come la primera línea del título', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await sembrarSociaCompleta(page, { descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);
    // «Texto más grande» del iPhone al máximo: la app lo recibe como `--escala-texto`.
    await page.addStyleTag({ content: '.student-app { --escala-texto: 1.35; }' });
    await page.waitForTimeout(400);

    const seccion = page.getByTestId('descubre');
    await seccion.scrollIntoViewIfNeeded();
    const lis = seccion.locator('li');
    const cajas = [];
    for (let i = 0; i < 3; i++) cajas.push(await lis.nth(i).boundingBox());
    expect(cajas.every(Boolean), 'no se pudieron medir las tarjetas').toBe(true);
    // 16:9 como MÍNIMO (puede ser más alta, nunca más baja)…
    for (const c of cajas) expect(c!.height).toBeGreaterThanOrEqual(c!.width * 9 / 16 - 1);
    // …y las tres igual de altas: una fila despareja se lee como rota.
    expect(Math.max(...cajas.map((c) => c!.height)) - Math.min(...cajas.map((c) => c!.height))).toBeLessThanOrEqual(1);

    // Ningún título empieza por encima de su tarjeta ni acaba por debajo (antes se recortaba por arriba).
    for (const [i, titulo] of ['Nuevas clases', 'Bienestar fuera del estudio'].entries()) {
      const t = await lis.nth(i).getByText(titulo).boundingBox();
      expect(t, `no se encontró «${titulo}»`).not.toBeNull();
      expect(t!.y).toBeGreaterThanOrEqual(cajas[i]!.y - 0.5);
      expect(t!.y + t!.height).toBeLessThanOrEqual(cajas[i]!.y + cajas[i]!.height + 0.5);
    }
  });

  test('un enlace `javascript:` deja la tarjeta sin enlace, no la borra', async ({ page }) => {
    // El editor valida al guardar, pero quien saneaba al PINTAR era el portal
    // viejo, que ya no existe. Si esto se rompe, la app de la alumna vuelve a
    // meter en el DOM lo que teclee el estudio.
    await sembrarSociaCompleta(page, { descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);

    const seccion = page.getByTestId('descubre');
    await expect(seccion).toContainText('Tu progreso importa');
    await expect(seccion.locator('[href^="javascript:"]')).toHaveCount(0);
    // La tercera tarjeta existe y NO es un enlace.
    const tercera = seccion.locator('li').nth(2);
    await expect(tercera).toContainText('Tu progreso importa');
    await expect(tercera.locator('a')).toHaveCount(0);
  });

  test('no cuesta ni una petición más', async ({ page }) => {
    // Sale del mismo payload que el resto de la home. Si algún día alguien le
    // pone su propio endpoint, este test lo dice.
    const and = await sembrarSociaCompleta(page, { descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);
    await expect(page.getByTestId('descubre')).toBeVisible();
    expect(and.sinMockear(), 'endpoints que nadie mockeó').toEqual([]);
    expect(and.llamadas()['/api/public/studio-data']).toBeLessThanOrEqual(2);
  });
});
