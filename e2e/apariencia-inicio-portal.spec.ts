import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del editor de temas: pestaña "Inicio del portal" (dashboard). Verifica
// el lado del EDITOR — el lado del consumo (portal cliente) se verifica en
// e2e/portal-home-modulos.spec.ts. Mismo patrón de mock que
// e2e/apariencia-boton-tarjeta.spec.ts / e2e/vocabulario-clientas.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
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
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/layout**', route => {
    if (route.request().method() === 'PUT') return json(route, {});
    return json(route, {
      orden: [], ocultos: [], menuPosition: 'lateral',
      home: { orden: [], ocultos: [] },
      portalHome: { orden: [], ocultos: [] },
    });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  await page.getByRole('tab', { name: 'Inicio del portal' }).click();
}

test.describe('Editor de temas — Fase 2: Inicio del portal', () => {
  test('los 4 módulos se listan, con la opción de ocultar cada uno', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Accesos rápidos/)).toBeVisible();
    await expect(page.getByText('Invita a una amiga')).toBeVisible();
    await expect(page.getByText(/Contenido del estudio/)).toBeVisible();
  });

  test('ocultar "Invita a una amiga" y guardar manda el patch correcto a /api/layout', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/layout') && r.method() === 'PUT'),
      page.getByRole('button', { name: /Guardar Inicio del portal/ }).click(),
    ]);
    const body = req.postDataJSON() as { portalHome?: { orden: string[]; ocultos: string[] } };
    expect(body.portalHome?.ocultos).toContain('invitarAmiga');
    expect(body.portalHome?.orden).toHaveLength(4);

    // El botón pasa a "Mostrar" tras ocultar.
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();
  });
});
