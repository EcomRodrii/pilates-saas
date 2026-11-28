import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, STUDIO_ROW } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi app» y «Mi web» con la forma de la «Tienda online» de Shopify (`miWebShopify`, 27-nov-2026): los mismos
// asuntos que la guiada, cada uno con su sitio, y que Network no se dé por puesto si el servidor dice que no.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, escaparate = true) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true, shellNuevo: true, pedirApp: false,
    miWebNueva: true, miWebShopify: escaparate,
  }));
  await ir(page, ruta);
}

test('Mi app: la app en grande, sus pantallas y los siete asuntos con su sitio', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await abrir(page, 'configuracion?tab=marca');
  const p = page.getByTestId('mi-app-escaparate');
  await expect(p).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('mi-app-guiada')).toHaveCount(0);
  for (const id of ['logo', 'estilo', 'entrada', 'inicio', 'frase', 'compartir']) {
    await expect(p.locator(`#paso-${id}`)).toBeVisible();
  }
  await expect(p.locator('#paso-reservar')).toBeVisible();
  await expect(p.locator('#paso-ficha-clase')).toBeVisible();
  await expect(p.getByRole('link', { name: 'Editar app' })).toHaveAttribute('href', '/configuracion/apariencia?paso=entrada');
  await expect(p.getByRole('link', { name: 'Abrir mi app' })).toHaveAttribute('href', `/portal/${STUDIO_ROW.slug}`);
  // El menú dice lo mismo que los textos.
  await expect(page.getByRole('navigation', { name: 'Secciones de Configuración' }).getByRole('link', { name: 'Mi app', exact: true })).toBeVisible();
});

test('Mi web: dirección, widgets, quién te encuentra y presentación; un «no» del servidor se dice', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await abrir(page, 'configuracion?tab=web');
  let intentos = 0;
  await page.route('**/rest/v1/studios**', async (r) => {
    if (r.request().method() !== 'PATCH') return r.fallback();
    intentos++;
    await json(r, { message: 'no' }, 500);
  });
  const p = page.getByTestId('mi-web-escaparate');
  await expect(p).toBeVisible({ timeout: 90_000 });
  await expect(p.getByRole('heading', { name: 'Explora más widgets' })).toBeVisible();
  for (const id of ['#paso-direccion', '#paso-widgets', '#paso-quien-la-ve', '#network', '#paso-presentacion']) {
    await expect(p.locator(id)).toBeVisible();
  }

  await p.locator('#paso-presentacion + div').getByRole('button', { name: /Escribir|Cambiar/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Cómo te presentas')).toBeVisible();
  await page.keyboard.press('Escape');

  const interruptor = p.getByRole('switch', { name: 'Aparecer en Tentare Network' });
  const antes = await interruptor.getAttribute('aria-checked');
  await interruptor.click();
  await expect(p.getByRole('alert')).toBeVisible();
  expect(intentos).toBeGreaterThan(0);
  await expect(interruptor).toHaveAttribute('aria-checked', antes!);
});

test('en el móvil no hay desplazamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const tab of ['marca', 'web']) {
    await abrir(page, `configuracion?tab=${tab}`);
    await expect(page.locator('[data-escaparate]')).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('apagado: la pantalla guiada de siempre', async ({ page }) => {
  await abrir(page, 'configuracion?tab=marca', false);
  await expect(page.getByTestId('mi-app-guiada')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('mi-app-escaparate')).toHaveCount(0);
});
