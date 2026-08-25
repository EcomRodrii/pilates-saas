import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Dos escrituras que se hacían "a ciegas".
//
// 1. Los créditos por acción se guardaban EN CADA PULSACIÓN de tecla: teclear
//    "100" mandaba tres UPDATE (1, 10, 100), sin await ni debounce. Ruidoso, y
//    si llegaban desordenados quedaba guardado el valor intermedio.
// 2. `marcarDevuelto` era optimista y fire-and-forget, igual que lo era
//    `marcarCobrado` antes de #384 — y una devolución también mueve dinero.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
  // La gamificación vive tras un PlanGate: sin plan de pago no se renderiza.
  plan: 'ESTUDIO', subscription_status: 'active',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function base(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await seedSesionDeDuena(page);
}


/** Abre Configuración › Logros y motivación › Recompensas (subpestaña con carga diferida). */
async function abrirRecompensas(page: Page) {
  await page.goto('/configuracion?tab=gamificacion');
  await expect(page.getByRole('heading', { name: 'Logros y motivación' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Recompensas' }).click();
  await expect(page.getByText('Créditos por acción')).toBeVisible({ timeout: 30_000 });
}

test.describe('Créditos por acción: una escritura, no una por tecla', () => {
  test('teclear un número manda UN solo guardado, al salir del campo', async ({ page }) => {
    const escrituras: string[] = [];
    await base(page);
    await page.route('**/rest/v1/reward_rules**', route => {
      if (route.request().method() === 'GET') return json(route, []);
      escrituras.push(route.request().method());
      return json(route, []);
    });

    await abrirRecompensas(page);
    const campo = page.getByRole('spinbutton', { name: /Créditos por/ }).first();

    await campo.fill('');
    await campo.pressSequentially('100', { delay: 60 });
    // Mientras se escribe no se ha guardado nada todavía.
    expect(escrituras).toHaveLength(0);

    await campo.blur();
    await expect.poll(() => escrituras.length, { timeout: 10_000 }).toBe(1);
  });

  test('si la BD rechaza, el campo vuelve al valor guardado', async ({ page }) => {
    await base(page);
    await page.route('**/rest/v1/reward_rules**', route => {
      if (route.request().method() === 'GET') {
        return json(route, [{
          id: 'rwr-1', studio_id: STUDIO_ID, trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir a clase',
          descripcion: null, creditos: 10, activa: true, tope_mensual: null, creado_en: '2026-01-01T00:00:00Z',
        }]);
      }
      return json(route, { message: 'new row violates row-level security policy' }, 403);
    });

    await abrirRecompensas(page);
    const campo = page.getByRole('spinbutton', { name: /Créditos por/ }).first();
    await expect(campo).toHaveValue('10');

    await campo.fill('99');
    await campo.blur();

    // No se queda un 99 en pantalla que no existe en la base de datos.
    await expect(campo).toHaveValue('10', { timeout: 10_000 });
  });
});
