import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Galería de temas: sección "Tema" del editor de marca (separada de
// "Personalizar", ver components/theme/theme-editor.tsx). No se puede
// verificar en el preview de Vercel de la PR (Turnstile bloquea el login en
// *.vercel.app — ver README), así que la verificación pasa por aquí, mockeando
// red con page.route (mismo patrón que e2e/apariencia-boton-tarjeta.spec.ts).
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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') return json(route, resolveTheme(themeGuardado));
    return json(route, themeResuelto);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
}

test.describe('Editor de temas — galería de temas', () => {
  test('sin tema elegido, "Clásico" aparece seleccionado', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Tema', { exact: true })).toBeVisible({ timeout: 30_000 });
    const clasico = page.getByRole('button', { name: /Clásico/ });
    const geometrico = page.getByRole('button', { name: /Geométrico/ });
    await expect(clasico).toBeVisible();
    await expect(geometrico).toBeVisible();
    await expect(clasico).toHaveClass(/border-brand/);
    await expect(geometrico).not.toHaveClass(/border-brand/);
  });

  test('elegir "Geométrico" y guardar manda themeId/themeVersion/portalHeadingFontId a /api/theme', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Tema', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Geométrico/ }).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      page.getByRole('button', { name: /Guardar borrador/ }).click(),
    ]);
    const body = req.postDataJSON() as Record<string, unknown>;
    expect(body.themeId).toBe('geometric');
    expect(body.themeVersion).toBe(1);
    expect(body.portalHeadingFontId).toBe('outfit');
    expect(body.themeCustomized).toBe(false);

    await expect(page.getByRole('button', { name: /Geométrico/ })).toHaveClass(/border-brand/);
  });

  test('elegir "Editorial" manda tabBarStyle/buttonStyle/cardStyle/portalHeadingFontId a /api/theme', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Tema', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Editorial/ }).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      page.getByRole('button', { name: /Guardar borrador/ }).click(),
    ]);
    const body = req.postDataJSON() as Record<string, unknown>;
    expect(body.themeId).toBe('editorial');
    expect(body.portalHeadingFontId).toBe('instrumentSansBold');
    expect(body.buttonStyle).toBe('solid');
    expect(body.cardStyle).toBe('elevated');
    expect(body.tabBarStyle).toBe('pestanaActiva');

    await expect(page.getByRole('button', { name: /Editorial/ })).toHaveClass(/border-brand/);
  });

  test('tocar "Personalizar" tras elegir un tema lo marca como "(personalizado)"', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Tema', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /Geométrico/ }).click();
    await expect(page.getByRole('button', { name: /Geométrico/ })).not.toContainText('personalizado');

    // Cualquier control de "Personalizar" — aquí, el estilo de botón — marca deriva.
    await page.getByRole('button', { name: 'Contorno' }).click();
    await expect(page.getByRole('button', { name: /Geométrico/ })).toContainText('personalizado');
  });
});
