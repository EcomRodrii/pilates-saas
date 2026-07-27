import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-9. "Exigir plan o bono activo para reservar" y "Devolver la sesión del
// bono en cancelaciones tardías" eran dos decisiones de negocio que nadie
// tomó: heredaban un DEFAULT false de hace meses. El propio copy de la
// pantalla llamaba "(recomendado)" a la opción protectora sin activarla.
//
// Ahora el estudio nace protegido: exige plan activo para reservar y NO
// devuelve la sesión al bono en cancelaciones tardías por defecto — quien de
// verdad quiera lo contrario lo desactiva a mano. Esta suite cubre el caso
// que importa: un estudio cuya fila en `studios` aún no trae estas columnas
// (null, como cualquier fila creada antes de la migración 0108).
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
  // Fila SIN reserva_exigir_plan ni cancelacion_devolver_bono_tardia: como
  // cualquier estudio anterior a la migración 0108 que aún no haya recargado
  // esas columnas, o el tipo antes de que el backfill llegara al cliente.
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion?tab=estudio');
}

test.describe('Reservas y cancelaciones nacen protegidas', () => {
  test('sin dato del servidor, los dos toggles arrancan activados', async ({ page }) => {
    await montar(page);

    // El <label> hace de nombre accesible del botón (elemento "labelable").
    const toggleDevolver = page.getByRole('button', { name: /Devolver la sesión del bono/ });
    const toggleExigir = page.getByRole('button', { name: /Exigir plan o bono activo/ });

    await expect(toggleDevolver).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await expect(toggleExigir).toHaveAttribute('aria-pressed', 'true');
  });

  test('el texto ya no llama "(recomendado)" a la opción que pierde la sesión', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Devolver la sesión del bono en cancelaciones tardías')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/Desactivado:.*pierde la sesión.*recomendado/)).toHaveCount(0);
    await expect(page.getByText(/Activado \(recomendado\): la sesión del bono se devuelve/)).toBeVisible();
  });
});
