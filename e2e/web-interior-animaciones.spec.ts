import { test, expect } from '@playwright/test';

// La entrada al scroll de las páginas interiores (components/web/revelar-web.tsx). Lo que fija:
//  1. En un navegador automatizado (`navigator.webdriver`) NO se esconde nada: los tests esperan a que un elemento deje de moverse y
//     no tienen por qué pagar una animación en cada página.
//  2. En uno normal, lo de debajo del pliegue se prepara, entra al llegar a pantalla y se limpia solo, sin dejar nada a medias.
//  3. Con «reducir movimiento» no se esconde nada, ni siquiera en un navegador normal.
const PAGINAS = ['/funcionalidades', '/soluciones/estudio-de-yoga', '/recursos/precio-clase-de-pilates', '/comparativa/tentare-vs-bsport'];

const sinWebdriver = () => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); };

test('en un navegador automatizado no se esconde ninguna sección', async ({ page }) => {
  await page.goto('/funcionalidades', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  expect(await page.locator('.w-rv-pre').count()).toBe(0);
});

for (const ruta of PAGINAS) {
  test(`${ruta}: lo de debajo del pliegue entra al hacer scroll y se limpia`, async ({ page }) => {
    await page.addInitScript(sinWebdriver);
    const errores: string[] = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.goto(ruta, { waitUntil: 'load' });
    await expect.poll(() => page.locator('.w-rv-pre').count(), { message: 'secciones preparadas', timeout: 30_000 }).toBeGreaterThan(0);
    // Lo que ya se ve al cargar nunca se esconde.
    expect(await page.$$eval('.w-rv-pre', els => els.filter(e => e.getBoundingClientRect().top < window.innerHeight * 0.9).length)).toBe(0);
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(80); }
    await expect.poll(() => page.locator('.w-rv-pre').count(), { message: 'sin secciones a medias', timeout: 15_000 }).toBe(0);
    expect(errores).toEqual([]);
  });
}

test('con «reducir movimiento» la página es la de siempre, también en un navegador normal', async ({ page }) => {
  await page.addInitScript(sinWebdriver);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/soluciones/estudio-de-yoga', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  expect(await page.locator('.w-rv-pre').count()).toBe(0);
});
