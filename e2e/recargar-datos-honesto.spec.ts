import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-15. El botón se llamaba "Restablecer datos de demo", vivía en una "Zona
// de riesgo" y avisaba de una pérdida irreversible de socios, sesiones, pagos
// y configuraciones. Ninguna de esas cosas era verdad: `resetDatosPilates()`
// solo hace `fetchAllStudioData()` + setState — cero llamadas destructivas.
// El pánico lo causaba el texto, no la acción. Arreglo = renombrar, no proteger.
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
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion?tab=estudio');
}

test.describe('El botón que ya no miente sobre borrar todo', () => {
  test('no hay ninguna "Zona de riesgo" ni aviso de pérdida irreversible', async ({ page }) => {
    await montar(page);

    await expect(page.getByRole('heading', { name: 'Recargar datos' })).toBeVisible({ timeout: 30_000 });

    // El texto viejo, que asustaba sin motivo, no existe en ningún sitio.
    await expect(page.getByText('Zona de riesgo')).toHaveCount(0);
    await expect(page.getByText(/irreversible/i)).toHaveCount(0);
    await expect(page.getByText(/se perderán/i)).toHaveCount(0);
    await expect(page.getByText('Restablecer datos de demo')).toHaveCount(0);
  });

  test('pulsar Recargar no pide confirmación y avisa con la verdad', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Recargar datos' })).toBeVisible({ timeout: 30_000 });

    // Sin diálogo intermedio: no hay nada que confirmar porque no es destructivo.
    await page.getByRole('button', { name: 'Recargar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.getByText('Datos recargados')).toBeVisible();
  });
});
