import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Badge «NUEVO» del menú lateral: Tentare marca una entrada desde /interno
// (tabla `menu_novedades`) y a la propietaria le sale un distintivo al lado.
// Puramente manual: no caduca y no se apaga al visitar la sección, la única
// forma de quitarlo es borrar la fila desde /interno.
//
// Se prueba AQUÍ y no solo con `node --test` porque las reglas puras
// (lib/menu-novedades.test.ts) no pueden ver lo único que importa de verdad:
// que el badge llegue a pintarse en el sidebar real. El fallo que esto atrapa
// es el mudo — la consulta se hace, la fila existe, y no aparece nada.
//
// ⚠️ El sidebar lee `menu_novedades` DIRECTO de Supabase, no por `/api/**`.
// El mock general de `/api/**` que usa el resto de la suite no lo cubre: hace
// falta interceptar `**/rest/v1/menu_novedades**` explícitamente, y ANTES del
// catch-all de `**/rest/v1/**` no — Playwright aplica la ÚLTIMA ruta que
// coincide, así que la específica va después.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-21';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedAuth(page: Page) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-duena', email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

async function mockBackend(page: Page, novedades: Array<{ href: string }>) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, []));
  await page.route('**/rest/v1/menu_novedades**', route => json(route, novedades));
}

// El badge vive DENTRO del enlace del menú, así que se busca por el enlace y no
// por el texto suelto: "Nuevo" a secas podría casar con cualquier botón de
// "Nueva clase" de la pantalla y el test pasaría sin probar nada.
function enlaceMenu(page: Page, nombre: string) {
  return page.getByRole('link', { name: new RegExp(`^${nombre}`) }).first();
}

test.describe('Badge NUEVO del menú', () => {
  test('la entrada marcada sale con el distintivo, y solo ella', async ({ page }) => {
    await mockBackend(page, [{ href: '/cobros' }]);
    await seedAuth(page);
    await page.goto('/dashboard');

    await expect(enlaceMenu(page, 'Cobros')).toContainText('Nuevo', { timeout: 30_000 });
    // Que aparezca en la marcada no prueba nada si aparece en todas.
    await expect(enlaceMenu(page, 'Clientas')).not.toContainText('Nuevo');
    await expect(enlaceMenu(page, 'Calendario')).not.toContainText('Nuevo');
  });

  test('sigue viéndose después de visitar esa sección y de recargar', async ({ page }) => {
    // Puramente manual: visitar la sección no lo apaga, solo borrar la fila
    // desde /interno lo hace. Antes se apagaba al entrar — eso era el bug.
    await mockBackend(page, [{ href: '/cobros' }]);
    await seedAuth(page);
    await page.goto('/dashboard');
    await expect(enlaceMenu(page, 'Cobros')).toContainText('Nuevo', { timeout: 30_000 });

    await enlaceMenu(page, 'Cobros').click();
    await expect(page).toHaveURL(/\/cobros/, { timeout: 30_000 });
    await expect(enlaceMenu(page, 'Cobros')).toContainText('Nuevo');

    await page.goto('/dashboard');
    await expect(enlaceMenu(page, 'Cobros')).toContainText('Nuevo', { timeout: 30_000 });
  });

  test('si la consulta falla, el menú sigue entero', async ({ page }) => {
    await mockBackend(page, []);
    await page.route('**/rest/v1/menu_novedades**', route => json(route, { message: 'boom' }, 500));
    await seedAuth(page);
    await page.goto('/dashboard');

    // Un badge que no aparece no rompe nada; un menú que desaparece, sí.
    await expect(enlaceMenu(page, 'Cobros')).toBeVisible({ timeout: 30_000 });
    await expect(enlaceMenu(page, 'Clientas')).toBeVisible();
    await expect(enlaceMenu(page, 'Cobros')).not.toContainText('Nuevo');
  });
});
