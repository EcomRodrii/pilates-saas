import { test, expect, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar el centro unos días. Toca dos cosas serias a la vez —cancela clases y
// mueve la caducidad de TODOS los bonos del estudio— así que la pantalla no
// puede dispararlo de un clic ni antes de tener las fechas.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function abrirHorario(page: import('@playwright/test').Page, capturar?: string[]) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/cierres**', route => {
    capturar?.push(route.request().postData() ?? '');
    return json(route, { cierreId: 'cie-1', dias: 7, clasesCanceladas: 12, bonosAmpliados: 30, recuperacionesAmpliadas: 4, incidencias: [] });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));

  await page.goto('/configuracion?tab=estudio&sub=horario');
  await expect(page.getByText('Cerrar el centro unos días')).toBeVisible({ timeout: 30_000 });
}

test('sin fechas no se puede disparar', async ({ page }) => {
  await abrirHorario(page);
  await expect(page.getByRole('button', { name: 'Cerrar el centro esos días' })).toBeDisabled();
});

test('avisa si la fecha de fin es anterior a la de inicio', async ({ page }) => {
  await abrirHorario(page);
  await page.locator('input[type="date"]').first().fill('2026-08-16');
  await page.locator('input[type="date"]').nth(1).fill('2026-08-10');
  await expect(page.getByText('La fecha de fin no puede ser anterior')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar el centro esos días' })).toBeDisabled();
});

test('pide confirmación antes de cancelar nada, y manda el rango real', async ({ page }) => {
  const enviados: string[] = [];
  await abrirHorario(page, enviados);

  await page.locator('input[type="date"]').first().fill('2026-08-10');
  await page.locator('input[type="date"]').nth(1).fill('2026-08-16');
  await page.getByRole('button', { name: 'Cerrar el centro esos días' }).click();

  // Un clic NO basta: cancela clases y mueve la caducidad de todos los bonos.
  expect(enviados, 'se disparó sin confirmar').toEqual([]);
  await expect(page.getByText(/no se deshace solo/)).toBeVisible();

  await page.getByRole('button', { name: 'Sí, cerrar esos días' }).click();
  await expect.poll(() => enviados.length, { timeout: 15_000 }).toBe(1);
  const cuerpo = JSON.parse(enviados[0]);
  expect(cuerpo.desde).toBe('2026-08-10');
  expect(cuerpo.hasta).toBe('2026-08-16');
});
