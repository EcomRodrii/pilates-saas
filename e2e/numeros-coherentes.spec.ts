import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-3. "Números que se contradicen entre pantallas. […] Si dos pantallas me dan
// cifras distintas, dejo de fiarme de las dos."
//
// Dos problemas distintos, y ninguno era un cálculo mal hecho:
//
//   · "Media por cliente" (Cobros) y "Ticket medio / cliente" (Informes) miden
//     cosas DISTINTAS con nombres casi idénticos: la primera reparte lo cobrado
//     entre TODAS las clientas activas, la segunda solo entre quienes pagaron.
//     Con 850 clientas y 65 pagadoras, 10 € y 130 € son las dos correctas.
//
//   · "30d sin venir" (dashboard) e "Inactivas 30d" (/clientas) sí eran una
//     inconsistencia REAL: el dashboard lo recalculaba con dos criterios que la
//     RPC de /clientas no aplica (exigía `activo` y descartaba a quien no ha
//     venido nunca). La tarjeta enlaza a /clientas, así que enseñaba un número y
//     te llevaba a otro. Ahora las dos leen la misma fuente.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Lo que devuelve la RPC `stats_clientas`. El 7 es el número que las DOS
// pantallas tienen que enseñar.
const STATS = { total: 20, activas: 12, con_bono: 5, inactivas_30d: 7 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
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
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE' }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // La única fuente de "sin venir 30d": si una pantalla no la usa, no coincidirá.
  await page.route('**/rest/v1/rpc/stats_clientas', route => json(route, [STATS]));

  await page.goto(ruta);
}

test.describe('Los números dicen lo mismo entre pantallas', () => {
  test('"Sin venir 30d" es el mismo en el dashboard y en Clientas', async ({ page }) => {
    await montar(page, '/dashboard');
    const enDashboard = page.getByRole('link', { name: /Sin venir 30d/ });
    await expect(enDashboard).toBeVisible({ timeout: 30_000 });
    await expect(enDashboard).toContainText('7');

    // La tarjeta lleva a /clientas: el número de destino tiene que ser el mismo.
    await montar(page, '/clientas');
    await expect(page.getByText('Sin venir 30d')).toBeVisible({ timeout: 30_000 });
    // El 7 de la RPC, no un recuento propio de la página.
    await expect(page.getByText('7', { exact: true }).first()).toBeVisible();
  });

  test('las dos medias de dinero ya no se llaman igual', async ({ page }) => {
    await montar(page, '/cobros');
    await expect(page.getByText('Ingreso medio por clienta')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/repartido entre todas las clientas activas/)).toBeVisible();
    // El nombre que se confundía con el de Informes ya no está.
    await expect(page.getByText('Media por cliente')).toHaveCount(0);

    await montar(page, '/informes');
    await expect(page.getByText('Ticket medio de quien pagó')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/solo entre las clientas con algún cobro/)).toBeVisible();
    await expect(page.getByText('Ticket medio / cliente')).toHaveCount(0);
  });
});
