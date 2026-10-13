import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// «Instala la app» (Perfil). Se ofrece SOLO donde este navegador puede hacer algo:
// botón con el aviso del navegador en Android/Chrome, guía de tres pasos en iPhone,
// y nada en escritorio sin aviso o con la app ya abierta desde su icono.
//
// ⚠️ El `beforeinstallprompt` se lanza a mano: Chromium de Playwright no lo emite
// solo. El mock cuenta cuántas veces se llamó a `prompt()` — un «Listo» sin esa
// llamada pasaría igual, y es el camino que no puede mentir.

const base = `/portal/${SLUG}`;
const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_INSTAGRAM_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0';

declare global { interface Window { __prompts: number } }

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
}

/** Lanza el aviso del navegador hasta que la app lo haya recogido (se registra al montarse). */
async function lanzarAviso(page: Page, outcome: 'accepted' | 'dismissed') {
  await page.evaluate(() => { window.__prompts = 0; });
  await expect.poll(async () => {
    await page.evaluate((o) => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(e, {
        prompt: async () => { window.__prompts++; },
        userChoice: Promise.resolve({ outcome: o }),
      });
      window.dispatchEvent(e);
    }, outcome);
    return page.getByTestId('abrir-instalar-app').count();
  }, { timeout: 30_000 }).toBe(1);
}

test.describe('Student PWA · instalar la app', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Android: el botón lanza el aviso del navegador y solo dice «Listo» si lo aceptó', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('abrir-invitar')).toBeVisible({ timeout: 30_000 });
    await lanzarAviso(page, 'accepted');

    await page.getByTestId('abrir-instalar-app').click();
    const hoja = page.getByRole('dialog', { name: 'Instalar la app' });
    await expect(hoja).toBeVisible();
    await expect(hoja).not.toContainText(/App Store|Google Play/i);
    await page.getByTestId('instalar-app').click();

    await expect(page.getByTestId('resultado-instalar')).toContainText('Listo');
    expect(await page.evaluate(() => window.__prompts)).toBe(1);
    // Ya no se ofrece instalar otra vez.
    await expect(page.getByTestId('instalar-app')).toHaveCount(0);
  });

  test('Android: si lo rechaza, lo dice y no finge que la instaló', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('abrir-invitar')).toBeVisible({ timeout: 30_000 });
    await lanzarAviso(page, 'dismissed');

    await page.getByTestId('abrir-instalar-app').click();
    await page.getByTestId('instalar-app').click();

    const res = page.getByTestId('resultado-instalar');
    await expect(res).toContainText('No pasa nada');
    await expect(res).not.toContainText('Listo');
    expect(await page.evaluate(() => window.__prompts)).toBe(1);
  });

  test('escritorio sin aviso del navegador: no se pinta una fila muerta', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('abrir-invitar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('abrir-instalar-app')).toHaveCount(0);
  });

  test('con la app ya abierta desde su icono no se ofrece instalar', async ({ page }) => {
    await montar(page);
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes('display-mode: standalone')
        ? ({ ...original('(min-width: 0px)'), matches: true, media: q } as MediaQueryList)
        : original(q));
    });
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('abrir-invitar')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(e, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
      window.dispatchEvent(e);
    });
    await expect(page.getByTestId('abrir-instalar-app')).toHaveCount(0);
  });

  test.describe('iPhone en Safari', () => {
    test.use({ userAgent: UA_SAFARI_IOS });

    test('la guía de tres pasos, sin botón de instalar', async ({ page }) => {
      await montar(page);
      await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
      const fila = page.getByTestId('abrir-instalar-app');
      await expect(fila).toBeVisible({ timeout: 30_000 });
      await expect(fila).toHaveAttribute('data-estado', 'ios-guia');
      await fila.click();
      await expect(page.getByTestId('pasos-instalar').getByRole('listitem')).toHaveCount(3);
      await expect(page.getByTestId('pasos-instalar')).toContainText('Añadir a pantalla de inicio');
      await expect(page.getByTestId('instalar-app')).toHaveCount(0);
    });
  });

  test.describe('iPhone dentro del navegador de otra app', () => {
    test.use({ userAgent: UA_INSTAGRAM_IOS });

    test('se manda a abrirlo en Safari en vez de a un botón que no existe', async ({ page }) => {
      await montar(page);
      await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
      const fila = page.getByTestId('abrir-instalar-app');
      await expect(fila).toBeVisible({ timeout: 30_000 });
      await expect(fila).toHaveAttribute('data-estado', 'ios-incrustado');
      await fila.click();
      await expect(page.getByRole('dialog', { name: 'Instalar la app' })).toContainText('Safari');
    });
  });
});
