import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// El mensaje destacado del estudio, arriba del inicio de la app (decisión 11A de «Mi
// app y mi web» v2). El servidor lo manda ya limpio y solo con `MI_WEB_NUEVA`
// (`mensajeParaLaApp`, `miWebNuevaPara`); la app lo pinta tal cual y, sin él, nada.
//
// Pasa también por WebKit (`webkit-publico`): lo ve la alumna desde su móvil, y lo
// que prueba —saltos de línea con `pre-line`, una palabra larguísima que no puede
// desbordar la pantalla— es justo lo que un motor resuelve distinto.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · mensaje destacado', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('sin mensaje no hay franja: ni un hueco vacío', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect(page.getByRole('searchbox', { name: 'Buscar clases o instructoras' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('mensaje-destacado')).toHaveCount(0);
  });

  test('con mensaje, arriba del inicio, como texto, respetando sus líneas y sin desbordar', async ({ page }) => {
    const texto = 'Cerramos el 1 de noviembre.\nEl sábado, horario de mañana. <b>no es HTML</b> supercalifragilisticoespialidosoextraordinariamente';
    const and = await sembrarSociaCompleta(page, { mensajeDestacado: texto });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const franja = page.getByTestId('mensaje-destacado');
    await expect(franja).toBeVisible({ timeout: 30_000 });
    await expect(franja).toHaveAccessibleName('Aviso del estudio');
    // Como texto: lo que escribe el estudio no entra como HTML.
    await expect(franja).toContainText('<b>no es HTML</b>');
    await expect(franja.locator('b')).toHaveCount(0);
    // Sus saltos de línea se respetan: la franja mide más de una línea.
    const alto = await franja.evaluate((el) => el.getBoundingClientRect().height);
    expect(alto).toBeGreaterThan(50);
    // Ni una palabra larguísima saca la pantalla de su ancho.
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
    // Arriba: antes que los accesos rápidos y que «Descubre».
    const yFranja = (await franja.boundingBox())!.y;
    const yAccesos = (await page.getByRole('link', { name: /Comunidad/ }).first().boundingBox())!.y;
    expect(yFranja).toBeLessThan(yAccesos);
    // Y sin pedir nada más: sale del mismo payload que el resto de la home.
    expect(and.sinMockear(), 'endpoints que nadie mockeó').toEqual([]);
    expect(and.llamadas()['/api/public/studio-data']).toBeLessThanOrEqual(2);
  });
});
