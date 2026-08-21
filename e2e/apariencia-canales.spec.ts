import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';
import { abrirCategoriaTema } from './apariencia-mock.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Canales del estudio — la mitad que vive en el TEMA (las cuatro redes;
// la web es una columna de `studios` y se edita en Configuración → Estudio,
// ver lib/canales-estudio.ts).
//
// Lo que prueba: que TikTok —la red nueva— se teclea, se GUARDA de verdad en
// el patch que sale hacia /api/theme, y que un tema publicado con las TRES
// claves de siempre (antes de que TikTok existiera) sigue mostrando lo que el
// estudio tenía escrito en vez de aparecer en blanco. Esa segunda parte es la
// regresión que de verdad daba miedo: un `.strict()` que rechaza el JSON
// guardado no falla en pantalla, deja los campos vacíos.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
  const puts: Record<string, unknown>[] = [];
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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  // `resolveTheme` a propósito y no el objeto crudo: es lo que hace el servidor
  // de verdad, así que el test recorre la MISMA resolución que producción.
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, { ok: true });
    }
    return json(route, themeResuelto);
  });
  await page.route('**/api/bloques**', route => {
    if (new URL(route.request().url()).searchParams.get('pantalla') === 'todas') {
      return json(route, { home: [], clases: [], bonos: [], reservar: [] });
    }
    return json(route, []);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  return { puts };
}

async function publicar(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publicar/ }).click();
}

test.describe('Canales del estudio — redes sociales en el editor', () => {
  test('TikTok tiene su casilla y lo escrito llega al patch de /api/theme', async ({ page }) => {
    const { puts } = await montar(page);

    await abrirCategoriaTema(page, 'Redes sociales');
    const tiktok = page.getByRole('textbox', { name: 'TikTok' });
    await expect(tiktok).toBeVisible({ timeout: 30_000 });
    await tiktok.fill('@estudiocarmen');

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && !r.url().includes('/publish') && r.method() === 'PUT'),
      publicar(page),
    ]);
    const redes = puts.at(-1)!.redesSociales as Record<string, string>;
    expect(redes.tiktok).toBe('@estudiocarmen');
    // Y las tres de siempre siguen viajando, no se pierden por el camino.
    expect(redes).toHaveProperty('instagram');
    expect(redes).toHaveProperty('facebook');
    expect(redes).toHaveProperty('whatsapp');
  });

  test('un tema publicado con SOLO las tres claves antiguas no se queda en blanco', async ({ page }) => {
    await montar(page, { redesSociales: { instagram: '@carmen', facebook: '', whatsapp: '600111222' } });

    await abrirCategoriaTema(page, 'Redes sociales');
    await expect(page.getByRole('textbox', { name: 'Instagram' })).toHaveValue('@carmen', { timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'WhatsApp' })).toHaveValue('600111222');
    // La clave nueva existe y llega vacía, no `undefined` (input controlado).
    await expect(page.getByRole('textbox', { name: 'TikTok' })).toHaveValue('');
  });

  test('algo que no da para un enlace se avisa en vez de desaparecer sin más', async ({ page }) => {
    await montar(page);

    await abrirCategoriaTema(page, 'Redes sociales');
    const instagram = page.getByRole('textbox', { name: 'Instagram' });
    await expect(instagram).toBeVisible({ timeout: 30_000 });
    await instagram.fill('mi estudio de pilates');
    await expect(page.getByText('No parece un enlace ni un usuario', { exact: false })).toBeVisible();

    // Con un @usuario normal, ningún aviso: es una forma válida de rellenarlo.
    await instagram.fill('@miestudio');
    await expect(page.getByText('No parece un enlace ni un usuario', { exact: false })).toHaveCount(0);
  });
});
