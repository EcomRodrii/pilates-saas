import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Urban Sports Club por API guarda su ID de proveedor y de ubicación en la
// MISMA fila que el interruptor «Vendo aquí». Guardar reescribe la config
// entera, así que un interruptor que mandara `{ modo: 'manual' }` a secas
// borraría los IDs — y sin ellos el cron no puede cancelar en USC lo que ya
// estaba publicado: clases fantasma en su app. Eso es lo que se prueba aquí,
// con contador de peticiones (un «no borró nada» sin petición no prueba nada).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const PROVEEDOR = '2bf3717c-348d-4e41-a2db-d32c35ae294c';
const UBICACION = 'b4302549-7d29-4d3e-9605-79ff8867f9d9';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: { apiDisponible: boolean }) {
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
  await page.route('**/rest/v1/integraciones**', route => json(route, [{
    id: 'intg-usc', studio_id: STUDIO_ID, tipo: 'URBAN_SPORTS_CLUB', activo: true,
    actualizado_en: '2026-10-01T10:00:00Z', ultimo_ok_en: null, ultimo_error: null, ultimo_error_en: null,
  }]));

  const guardados: { tipo: string; activo: boolean; config: Record<string, string> }[] = [];
  // Registrada al final para ganar al comodín `**/api/**`.
  await page.route('**/api/integrations/config**', async route => {
    if (route.request().method() === 'PUT') {
      guardados.push(route.request().postDataJSON());
      return json(route, { ok: true });
    }
    return json(route, {
      config: { modo: 'api', providerId: PROVEEDOR, locationId: UBICACION },
      apiDisponible: opts.apiDisponible,
    });
  });

  await page.goto('/configuracion?tab=conexiones');
  await page.locator('#plataformas-externas').click({ timeout: 30_000 });
  return guardados;
}

const interruptorUsc = (page: Page) => page.getByRole('switch', { name: 'Vendo en Urban Sports Club' });
const proximamente = (page: Page) => page.getByText('Conexión automática: próximamente');

test.describe('Urban Sports Club: los IDs de la conexión no se pierden', () => {
  test('apagar «Vendo aquí» conserva el proveedor y la ubicación', async ({ page }) => {
    const guardados = await montar(page, { apiDisponible: true });
    await expect(page.getByTestId('conexion-usc')).toBeVisible();
    // USC ya se puede conectar: «próximamente» solo en ClassPass y Wellhub.
    await expect(proximamente(page)).toHaveCount(2);
    // Y en Conexiones, su fila (con su logo, como el resto) dice que está conectada.
    await expect(page.locator('#plataformas-externas-urban_sports_club')).toContainText('Conectado');
    await expect(interruptorUsc(page)).toBeEnabled();
    await interruptorUsc(page).click();

    await expect.poll(() => guardados.length).toBeGreaterThan(0);
    const ultimo = guardados.at(-1)!;
    expect(ultimo.tipo).toBe('URBAN_SPORTS_CLUB');
    expect(ultimo.activo).toBe(false);
    expect(ultimo.config.providerId).toBe(PROVEEDOR);
    expect(ultimo.config.locationId).toBe(UBICACION);
  });

  test('vaciar los IDs vuelve a manual, pero los guarda para poder retirar lo publicado', async ({ page }) => {
    const guardados = await montar(page, { apiDisponible: true });
    const form = page.getByTestId('conexion-usc');
    await form.getByLabel('ID de proveedor').fill('');
    await form.getByLabel('ID de ubicación').fill('');
    await form.getByRole('button', { name: 'Guardar conexión' }).click();

    await expect.poll(() => guardados.length).toBeGreaterThan(0);
    const ultimo = guardados.at(-1)!;
    expect(ultimo.activo).toBe(true);
    expect(ultimo.config.modo).toBe('manual');
    expect(ultimo.config.providerId).toBe(PROVEEDOR);
  });

  test('un ID mal pegado no se guarda', async ({ page }) => {
    const guardados = await montar(page, { apiDisponible: true });
    const form = page.getByTestId('conexion-usc');
    await form.getByLabel('ID de ubicación').fill('no-es-un-id');
    await form.getByRole('button', { name: 'Guardar conexión' }).click();
    await expect(form.getByRole('alert')).toContainText('8-4-4-4-12');
    expect(guardados).toHaveLength(0);
  });

  test('sin las credenciales de Tentare en USC no se piden IDs que no servirían', async ({ page }) => {
    await montar(page, { apiDisponible: false });
    await expect(interruptorUsc(page)).toBeEnabled();
    await expect(page.getByTestId('conexion-usc')).toHaveCount(0);
    // Las tres dicen que la conexión automática llega más adelante, y el modo
    // manual sigue a mano.
    await expect(proximamente(page)).toHaveCount(3);
    await expect(page.getByText(/Hasta entonces, apúntalas tú/)).toBeVisible();
    // En Conexiones, una fila por plataforma, cada una con su «Próximamente».
    for (const id of ['#plataformas-externas', '#plataformas-externas-urban_sports_club', '#plataformas-externas-wellhub']) {
      await expect(page.locator(id)).toContainText('Próximamente');
    }
    await expect(page.locator('#plataformas-externas')).toContainText('ClassPass');
  });
});
