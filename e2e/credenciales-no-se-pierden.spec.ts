import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Las credenciales ya no viajan en el arranque del panel: el modal las pide al
// abrirse (GET /api/integrations/config).
//
// El modo de fallo caro de ese cambio no es que el modal salga vacío: es que la
// propietaria vea sus campos en blanco, pulse Guardar y se lleve por delante un
// token que estaba bien. Eso es lo que se prueba aquí.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarIntegraciones(page: Page, opts: { configFalla?: boolean } = {}) {
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
  // Ojo: tal y como llega ahora del panel, SIN `config`. Si el modal dependiera
  // de que viniera por aquí, este test lo caza.
  await page.route('**/rest/v1/integraciones**', route => json(route, [{
    id: 'intg-whatsapp', studio_id: STUDIO_ID, tipo: 'WHATSAPP', activo: true,
    actualizado_en: '2026-08-01T10:00:00Z',
    ultimo_ok_en: '2026-08-18T10:00:00Z', ultimo_error: null, ultimo_error_en: null,
  }]));
  // Registrada al final para ganar al comodín `**/api/**`.
  await page.route('**/api/integrations/config**', route => opts.configFalla
    ? json(route, { error: 'boom' }, 500)
    : json(route, { config: { token: 'EL-TOKEN-BUENO', phoneId: '123456' } }));

  await page.goto('/configuracion?tab=integraciones');
}

test.describe('Las credenciales se piden al abrir, y no se pierden', () => {
  test('el modal se abre con el token que ya estaba guardado', async ({ page }) => {
    await montarIntegraciones(page);
    // «Gestionar» solo lo tiene una integración conectada, y en este montaje la
    // única conectada es WhatsApp.
    await page.getByRole('button', { name: 'Gestionar' }).click({ timeout: 30_000 });

    // El valor viene del endpoint, no del arranque del panel (que ya no lo trae).
    await expect(page.locator('input[value="EL-TOKEN-BUENO"]')).toBeVisible({ timeout: 15_000 });
  });

  test('si no se pueden leer, el modal NO se abre en blanco', async ({ page }) => {
    // Abrirlo vacío es lo que convierte un fallo de red en «he perdido mi
    // token»: se ven los campos en blanco, se pulsa Guardar y se sobrescribe.
    await montarIntegraciones(page, { configFalla: true });
    await page.getByRole('button', { name: 'Gestionar' }).click({ timeout: 30_000 });

    await expect(page.getByText(/No se pudieron cargar las credenciales/)).toBeVisible({ timeout: 15_000 });
    // Y ni rastro del formulario: sin campos no hay Guardar que pueda borrar nada.
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
  });
});
