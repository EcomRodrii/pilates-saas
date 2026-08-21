import { test, expect, type Page, type Route } from '@playwright/test';

// Pantallas de valor: lo primero que ve la propietaria, antes del asistente.
// Se monta como el resto de e2e del panel (sesión sembrada en localStorage).
const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function montarBienvenida(page: Page) {
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
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // `bienvenida_vista_en: null` es lo que dispara la pantalla completa.
  await page.route('**/rest/v1/studios**', route =>
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: AUTH_UID, bienvenida_vista_en: null,
    }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
}

test('la primera pantalla enseña valor antes de pedir un solo dato', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toBeVisible({ timeout: 30_000 });
  // Lo que NO debe aparecer todavía: la primera pregunta del asistente.
  await expect(page.getByText('¿Cuántos centros tienes?')).toHaveCount(0);
  await expect(page.getByText('1 de 4')).toBeVisible();
});

test('las cuatro pantallas avanzan y desembocan en el asistente', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Cobras las cuotas y los bonos automáticamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Cuando una instructora no puede, buscamos sustituta' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Ves qué clases se llenan y cuáles no' })).toBeVisible();
  await expect(page.getByText('4 de 4')).toBeVisible();
  // La última no dice "Siguiente": dice lo que va a pasar.
  await page.getByRole('button', { name: 'Montamos tu estudio' }).click();
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toHaveCount(0);
});

// Quien ya se ha decidido no necesita que le vendan nada — y la salida está
// desde la PRIMERA pantalla, no escondida hasta el final.
test('se puede saltar la baraja entera desde la primera pantalla', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toHaveCount(0);
});

test('Tenti se pinta con los colores de marca, no con el índigo del kit', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toBeVisible({ timeout: 30_000 });
  const contorno = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--tenti-contorno').trim());
  expect(contorno.toUpperCase()).toBe('#343825');
  // El índigo y el coral del kit original no pueden haberse colado en el DOM.
  const html = await page.content();
  expect(html).not.toContain('#3D3B73');
  expect(html).not.toContain('#F07C80');
});
