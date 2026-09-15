import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar el centro unos días. Toca dos cosas serias a la vez —cancela clases y
// mueve la caducidad de TODOS los bonos del estudio— así que la pantalla no
// puede dispararlo de un clic ni antes de tener las fechas.
//
// Desde el 15-sep (v2) es una fila de Mi estudio con su cajón: «Guardar» sale
// al tocar algo, se queda apagado sin las dos fechas y pregunta antes de mandar.
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

async function abrirCierre(page: Page, capturar: string[]) {
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
    capturar.push(route.request().postData() ?? '');
    return json(route, { cierreId: 'cie-1', dias: 7, clasesCanceladas: 12, bonosAmpliados: 30, recuperacionesAmpliadas: 4, incidencias: [] });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));

  await page.goto('/configuracion?tab=estudio#cerrar-el-centro');
  await expect(page.getByRole('heading', { level: 2, name: 'Cerrar el centro', exact: true })).toBeVisible({ timeout: 30_000 });
}

const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const cajon = (page: Page) => page.getByRole('dialog', { name: 'Cerrar el centro' });

test('sin las dos fechas no se puede disparar, y sin tocar nada no hay botón', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);
  await expect(guardar(page)).toHaveCount(0);

  await page.getByLabel('Desde').fill('2026-08-10');
  await expect(guardar(page)).toBeDisabled();
  await expect(cajon(page).getByRole('alert')).toContainText('Elige el primer y el último día');
  expect(enviados).toEqual([]);
});

test('avisa si la fecha de fin es anterior a la de inicio', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);
  await page.getByLabel('Desde').fill('2026-08-16');
  await page.getByLabel('Hasta (incluido)').fill('2026-08-10');
  await expect(cajon(page).getByRole('alert')).toContainText('La fecha de fin no puede ser anterior');
  await expect(guardar(page)).toBeDisabled();
  expect(enviados).toEqual([]);
});

test('pide confirmación antes de cancelar nada, y manda el rango real', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);

  await page.getByLabel('Desde').fill('2026-08-10');
  await page.getByLabel('Hasta (incluido)').fill('2026-08-16');
  await guardar(page).click();

  // Un clic NO basta: cancela clases y mueve la caducidad de todos los bonos.
  const pregunta = page.getByRole('dialog', { name: /¿Cerrar el centro/ });
  await expect(pregunta).toContainText(/no se deshace solo/);
  expect(enviados, 'se disparó sin confirmar').toEqual([]);

  await pregunta.getByRole('button', { name: 'Sí, cerrar esos días' }).click();
  await expect.poll(() => enviados.length, { timeout: 15_000 }).toBe(1);
  const cuerpo = JSON.parse(enviados[0]);
  expect(cuerpo.desde).toBe('2026-08-10');
  expect(cuerpo.hasta).toBe('2026-08-16');
  // Hecho: el cajón se cierra y se cuenta qué ha pasado.
  await expect(cajon(page)).toHaveCount(0);
  await expect(page.getByText('7 días cerrados · 12 clases canceladas · 30 bonos prorrogados')).toBeVisible();
});
