import { test, expect, type Page } from '@playwright/test';
import { SLUG, sembrarSociaCompleta } from './socia-completa';

// Dos cosas que hacen que la app de la alumna se sienta nativa y que se pueden
// mirar sin un iPhone:
//
//   · Tirar para actualizar (`TirarParaActualizar`): con el dedo, desde arriba
//     del todo, vuelve a pedir los datos. Con CONTADOR de peticiones: «no se ve
//     el círculo» podría ser verdad porque no se intentó nada.
//   · Los «tics de web» quitados SOLO dentro de la app (`html[data-app-nativa]`
//     en student.css): botones no seleccionables como texto, pero los campos de
//     formulario siguen dejando escribir y seleccionar.

const base = `/portal/${SLUG}`;

/** Un tirón con el dedo, de arriba abajo, con eventos táctiles de verdad (CDP). */
async function tirarHaciaAbajo(page: Page, px: number) {
  const cdp = await page.context().newCDPSession(page);
  const x = 195; const y0 = 160;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let d = 10; d <= px; d += 15) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + d }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('Student PWA · tirar para actualizar', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('tirar desde arriba vuelve a pedir los datos; un tirón corto no', async ({ page }) => {
    const andamiaje = await sembrarSociaCompleta(page, { reservada: true });
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('proxima-clase')).toBeVisible({ timeout: 60_000 });
    const pedidas = () => andamiaje.llamadas()['/api/public/studio-data'] ?? 0;
    const antes = pedidas();
    expect(antes).toBeGreaterThan(0);

    // Corto: no llega a la raya, no recarga.
    await tirarHaciaAbajo(page, 40);
    await page.waitForTimeout(800);
    expect(pedidas()).toBe(antes);

    // Largo: recarga, y la pantalla sigue en su sitio (sin esqueleto).
    await tirarHaciaAbajo(page, 300);
    await expect.poll(pedidas, { timeout: 15_000 }).toBeGreaterThan(antes);
    await expect(page.getByTestId('proxima-clase')).toBeVisible();
    await expect(page.locator('.skel')).toHaveCount(0);
  });
});

test.describe('Student PWA · dentro de la app de iOS', () => {
  test.describe.configure({ timeout: 120_000 });

  test('botones y pestañas no se seleccionan como texto; los campos siguen dejando escribir', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
    const buscador = page.getByRole('searchbox', { name: 'Buscar clases o instructoras' });
    await expect(buscador).toBeVisible({ timeout: 60_000 });

    // Lo que pone `PuenteNativo` dentro de la carcasa de Capacitor.
    await page.evaluate(() => { document.documentElement.dataset.appNativa = '1'; });

    const seleccion = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).userSelect);
    expect(await seleccion('nav[aria-label="Principal"] a')).toBe('none');
    expect(await seleccion('.student-app button.pill')).toBe('none');
    expect(await seleccion('.student-app input[type="search"]')).toBe('text');
    // Y se escribe en él como siempre.
    await buscador.fill('Reformer');
    await expect(buscador).toHaveValue('Reformer');

    // Fuera de la app (sin la marca), nada cambia.
    await page.evaluate(() => { delete document.documentElement.dataset.appNativa; });
    expect(await seleccion('nav[aria-label="Principal"] a')).not.toBe('none');
  });
});
