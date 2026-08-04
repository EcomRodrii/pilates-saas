import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Biblioteca de temas (/configuracion/apariencia) — la pantalla de llegada de
// Apariencia, donde se elige el tema viéndolo pintado. Antes esto era la
// categoría "Tema" dentro del editor; al mudarse a su propia pantalla, estas
// pruebas se mudaron con ella (el editor ya no duplica la galería).
//
// No se puede verificar en el preview de Vercel de la PR (Turnstile bloquea el
// login en *.vercel.app — ver README), así que la verificación pasa por aquí,
// mockeando red con page.route (mismo patrón que apariencia-boton-tarjeta).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  const puts: Record<string, unknown>[] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      puts.push(body);
      return json(route, resolveTheme(body));
    }
    return json(route, themeResuelto);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  return { puts };
}

/** La fila de un tema dentro de la tarjeta "Biblioteca de temas". */
function filaTema(page: Page, id: string) {
  return page.locator(`[data-tema="${id}"]`);
}

test.describe('Biblioteca de temas', () => {
  test('lista los temas de la galería, con el activo marcado "En uso"', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // Los tres temas con paleta propia de la última tanda, y los previos.
    for (const id of ['classic', 'geometric', 'editorial', 'oliva', 'bloom', 'noir']) {
      await expect(filaTema(page, id)).toBeVisible();
    }
    // Sin themeId guardado, el tema resuelto es "classic" → es el que está en uso.
    await expect(filaTema(page, 'classic').getByText('En uso')).toBeVisible();
    await expect(filaTema(page, 'noir').getByText('En uso')).toHaveCount(0);
  });

  test('"Tu tema" muestra el tema instalado con su versión', async ({ page }) => {
    await montar(page, { themeId: 'editorial', themeVersion: 1 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('"Usar" en un tema lo guarda en el borrador con sus defaults', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // "Usar" solo aparece en los temas que NO están en uso.
    const usarGeometrico = filaTema(page, 'geometric').getByRole('button', { name: 'Usar' });
    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      usarGeometrico.click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('geometric');
    expect(body.themeVersion).toBe(1);
    expect(body.portalHeadingFontId).toBe('outfit');
    expect(body.themeCustomized).toBe(false);
  });

  test('"Usar" en Noir manda su paleta y la barra oscura', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'noir').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('noir');
    expect(body.barraOscura).toBe(true);
    expect(body.primary).toBe('#1D2A21');
    expect(body.secondary).toBe('#C9A24D');
  });

  test('"Personalizar" lleva al editor', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Personalizar' }).first().click();
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/);
  });
});
