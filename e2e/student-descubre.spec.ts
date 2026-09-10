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
