import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-14. "No hay lista de sedes, solo 'añadir'." La dueña de una cadena podía
// crear sedes desde Configuración > Estudio, pero para VER cuántas tenía y
// cambiarse entre ellas tenía que abrir el menú de perfil, en otro rincón de
// la app. Mismo dato que ese selector (mis_estudios()), así que las dos
// vistas nunca pueden decir cosas distintas.
//
// Mismo contrato de mock que sede-activa.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-centro';
const STUDIO_ID_2 = 'studio-norte';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function mockBackend(page: Page, sedes: { id: string; nombre: string; ciudad?: string }[]) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/mis_estudios', route => json(route, sedes));
  await page.route('**/rest/v1/sesion_activa**', route => json(route, []));
}

const DOS_SEDES = [
  { id: STUDIO_ID, nombre: 'Pilates Centro', ciudad: 'Madrid' },
  { id: STUDIO_ID_2, nombre: 'Pilates Norte', ciudad: 'Bilbao' },
];

test.describe('Tus sedes (Configuración > Estudio)', () => {
  test('con dos sedes, las lista y marca cuál es la activa', async ({ page }) => {
    await mockBackend(page, DOS_SEDES);
    await seedSesionDeDuena(page);
    await page.goto('/configuracion?tab=estudio&sub=sedes');

    await expect(page.getByRole('heading', { name: 'Tus sedes' })).toBeVisible({ timeout: 30_000 });
    // Scopeado a la tarjeta: el switcher de la barra lateral también dice
    // "Pilates Centro" cuando hay dos sedes, y con getByText a secas empata.
    const tarjeta = page.getByRole('heading', { name: 'Tus sedes' }).locator('..');
    await expect(tarjeta.getByText('2 sedes en tu cadena')).toBeVisible();
    await expect(tarjeta.getByText('Pilates Centro')).toBeVisible();
    await expect(tarjeta.getByText('Pilates Norte')).toBeVisible();
    await expect(tarjeta.getByText('Estás aquí')).toBeVisible();
    await expect(tarjeta.getByRole('button', { name: 'Cambiarme' })).toBeVisible();
  });

  test('con una sola sede, no se pinta la lista (nada que desambiguar)', async ({ page }) => {
    await mockBackend(page, [{ id: STUDIO_ID, nombre: 'Pilates Centro' }]);
    await seedSesionDeDuena(page);
    await page.goto('/configuracion?tab=estudio&sub=sedes');

    await expect(page.getByRole('heading', { name: 'Marca' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Tus sedes' })).toHaveCount(0);
  });

  test('cambiarse desde la lista confirma en el destino, igual que el selector de perfil', async ({ page }) => {
    await mockBackend(page, DOS_SEDES);
    await seedSesionDeDuena(page);
    await page.goto('/configuracion?tab=estudio&sub=sedes');

    await expect(page.getByRole('heading', { name: 'Tus sedes' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Cambiarme' }).click();

    const confirmacion = page.getByRole('status').filter({ hasText: 'Ahora estás en' });
    await expect(confirmacion).toContainText('Ahora estás en Pilates Norte', { timeout: 30_000 });
  });
});
