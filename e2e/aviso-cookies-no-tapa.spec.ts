import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El aviso de cookies de publicidad (Meta) no puede tapar el botón «Continuar».
//
// El 9-oct-2026, con ~60 € de anuncios, 105 personas abrieron el alta y solo 2
// pasaron del paso 1. Medido: en un iPhone dentro del navegador de un anuncio
// (390×664) el aviso, `fixed` abajo, quedaba ENCIMA del botón del paso 1
// (`elementFromPoint` devolvía el aviso, no el botón). El aviso reserva ahora su
// alto al final de la página mientras se ve.
//
// El aviso solo se pinta en tentare.app (`hostConPixel`), así que el navegador se
// engaña para que ese nombre apunte al servidor local. Sin esto el aviso no
// existe en e2e y el test pasaría sin probar nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ launchOptions: { args: ['--host-resolver-rules=MAP www.tentare.app 127.0.0.1'] } });

function urlAlta(): string {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000');
  return `http://www.tentare.app:${base.port || '3000'}/crear-estudio`;
}

const aviso = (page: Page) => page.getByRole('region', { name: 'Cookies de publicidad' });

/** ¿Lo que hay en el centro del botón «Continuar» es el propio botón? */
async function botonAlcanzable(page: Page): Promise<{ alcanzable: boolean; quien: string }> {
  return page.evaluate(() => {
    const boton = [...document.querySelectorAll('button')].find((b) => /Continuar/.test(b.textContent ?? ''));
    if (!boton) return { alcanzable: false, quien: 'no hay botón' };
    const r = boton.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    if (cy < 0 || cy > innerHeight) return { alcanzable: false, quien: 'fuera de pantalla' };
    const encima = document.elementFromPoint(r.left + r.width / 2, cy);
    return { alcanzable: !!encima && boton.contains(encima), quien: (encima?.textContent ?? '').slice(0, 40) };
  });
}

async function abrir(page: Page) {
  await page.addInitScript(() => localStorage.removeItem('tentare-cookies-publicidad'));
  await page.goto(urlAlta());
  await expect(aviso(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
}

test('en un iPhone con barras (390×664), al bajar del todo el botón «Continuar» queda por encima del aviso', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await abrir(page);

  // Bajar hasta el final, como haría quien ve el botón tapado.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);

  const { alcanzable, quien } = await botonAlcanzable(page);
  expect(alcanzable, `el aviso tapa el botón (en su centro hay: «${quien}»)`).toBe(true);
});

test('en un Android pequeño (360×560) también', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 });
  await abrir(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const { alcanzable, quien } = await botonAlcanzable(page);
  expect(alcanzable, `el aviso tapa el botón (en su centro hay: «${quien}»)`).toBe(true);
});

test('al decidir, el aviso se va y la página recupera su sitio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await abrir(page);
  const conAviso = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
  expect(conAviso, 'con el aviso visible la página reserva su alto').toBeGreaterThan(100);

  await aviso(page).getByRole('button', { name: 'Rechazar' }).click();
  await expect(aviso(page)).toHaveCount(0);
  const sinAviso = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
  expect(sinAviso, 'sin el aviso no queda hueco').toBeLessThan(conAviso);
  expect(sinAviso).toBeLessThan(10);
});
