import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Complementos de Founding Studio (19-oct-2026): 29 € + Centro de Control 9 €
// = 38 €/mes. Es dinero: la pantalla solo cambia con lo que contesta el
// servidor, y con un «no» lo dice sin dar el complemento por activado. Cada
// camino de fallo cuenta sus peticiones: «no mintió» sin haber intentado nada
// no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const ESTADO = {
  plan: 'BASE', subscriptionStatus: 'active', activo: true, configurado: true, esPropietaria: true,
  bloqueado: false, enPrueba: false, pruebaTermina: null, periodoTermina: '2026-11-15T10:00:00+00:00',
  complementos: { pagaAparte: true, contratados: [] as string[], disponibles: ['decisiones', 'sustituciones', 'ia'] },
};

async function montar(page: Page, addons: (route: Route) => Promise<void>) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e-duena', email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, STORAGE_KEY);
  const intentos: unknown[] = [];
  await page.route('**/api/**', (route) => json(route, {}));
  await page.route('**/api/billing/status**', (route) => json(route, ESTADO));
  await page.route('**/api/billing/addons', async (route) => { intentos.push(route.request().postDataJSON()); await addons(route); });
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.goto('/suscripcion');
  await expect(page.getByRole('heading', { name: 'Complementos' })).toBeVisible({ timeout: 30_000 });
  return intentos;
}

const fila = (page: Page, id: string) => page.locator(`[data-complemento="${id}"]`);

test.describe('Complementos de Founding Studio', () => {
  test('activar: confirma con el total nuevo y solo cambia con lo que dice el servidor', async ({ page }) => {
    const intentos = await montar(page, (route) => json(route, { ok: true, addons: ['decisiones'] }));
    await expect(page.getByText('Total al mes:')).toContainText('29€');

    await fila(page, 'decisiones').getByRole('button', { name: 'Activar' }).click();
    await expect(page.getByText(/Tu cuota pasará a/)).toContainText('38€/mes');
    expect(intentos).toHaveLength(0); // nada sin confirmar

    await page.getByRole('button', { name: /Sí, activar por 9€\/mes/ }).click();
    await expect(fila(page, 'decisiones').getByText('Activo')).toBeVisible();
    await expect(page.getByText('Total al mes:')).toContainText('38€');
    expect(intentos).toEqual([{ addon: 'decisiones', activar: true }]);
  });

  for (const [nombre, responder] of [
    ['409', (r: Route) => json(r, { error: 'Tu último cobro no ha salido.' }, 409)],
    ['500', (r: Route) => json(r, { error: 'No se ha podido cambiar el complemento.' }, 500)],
    ['sin red', (r: Route) => r.abort('failed')],
  ] as const) {
    test(`si el servidor dice que no (${nombre}), no se da por activado`, async ({ page }) => {
      const intentos = await montar(page, responder);
      await fila(page, 'ia').getByRole('button', { name: 'Activar' }).click();
      await page.getByRole('button', { name: /Sí, activar/ }).click();
      await expect(page.locator('#complementos').getByRole('alert')).toBeVisible();
      expect(intentos.length).toBeGreaterThan(0);
      await expect(fila(page, 'ia').getByText('Activo')).toHaveCount(0);
      await expect(page.getByText('Total al mes:')).toContainText('29€');
    });
  }
});
