import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Primer paso para retirar Tentare Core: en el panel, la instructora ve un aviso
// que la lleva a la app del estudio. No bloquea nada, se puede descartar (y no
// vuelve al recargar), y la dueña no lo ve.
//
// Andamiaje copiado de `e2e/instructora-ausencia.spec.ts`: misma sesión sembrada
// y mismos mocks, con /mi-perfil como pantalla que ambas pueden abrir.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_INSTRUCTORA = 'auth-e2e-instructora';
const UID_DUENA = 'auth-e2e-duena';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#F7A6C4', auth_user_id: UID_INSTRUCTORA, email: 'marta@example.com', telefono: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: mail, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

async function mockBackend(page: Page) {
  // Playwright resuelve en orden INVERSO al de registro: el genérico va primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/api/equipo/ausencias', route => json(route, { items: [] }));
}

test.describe('Panel: aviso de la app del estudio para la instructora', () => {
  test('la instructora ve el aviso con el enlace a su app, y «Ahora no» lo quita también al recargar', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/mi-perfil');

    const aviso = page.getByTestId('aviso-app-instructora');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso.getByRole('link', { name: 'Abrir la app', exact: true })).toHaveAttribute('href', '/portal/pilates-centro/equipo');

    await aviso.getByRole('button', { name: 'Ahora no', exact: true }).click();
    await expect(aviso).toHaveCount(0);

    await page.reload();
    await expect(page.getByText('Tus ausencias')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('aviso-app-instructora')).toHaveCount(0);
  });

  test('la dueña no ve el aviso', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_DUENA, 'cloe@example.com');
    await page.goto('/mi-perfil');

    await expect(page.getByText('Tu nombre, tu foto')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('aviso-app-instructora')).toHaveCount(0);
  });
});
