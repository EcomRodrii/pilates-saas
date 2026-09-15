import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Los enlaces a Configuración aterrizan donde dicen.
//
// Hasta el 15-sep: la notificación «Canje pendiente de entregar» abría
// Recompensas, «Configurar mis salas» abría Clases, la vuelta de conectar Stripe
// abría Clases y salas —y el aviso de «conectado» no salía nunca, porque solo
// lo pinta Integraciones—, y recargar después de cambiar de pestaña devolvía a
// la primera. Nada fallaba: solo mandaba a otro sitio.
//
// La traducción URL → pestaña está en lib/configuracion/destino.ts, con su test
// unitario que barre el repo. Esto comprueba lo que ese test no ve: que la
// página la aplica al montar, y que escribe la URL al elegir.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR', nif: 'B00000000',
  // La gamificación vive tras un PlanGate: sin plan de pago no se renderiza.
  plan: 'ESTUDIO', subscription_status: 'active',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
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
}

async function panel(page: Page) {
  // Playwright resuelve las rutas en orden INVERSO: comodines primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await seedSesion(page);
}

const pestanas = (page: Page) => page.locator('[data-tour="configuracion-vista"]');

test.describe('Los enlaces a Configuración aterrizan donde dicen', () => {
  test('la notificación de un canje abre Canjes, no Recompensas', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=gamificacion&sub=canjes');

    await expect(page.getByRole('tab', { name: 'Canjes' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pendientes de entregar' })).toBeVisible();
  });

  test('«Configurar mis salas» abre Salas, no Clases', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=clases-salas&sub=salas');

    await expect(page.getByRole('tab', { name: 'Salas' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Clases' })).toHaveAttribute('aria-selected', 'false');
  });

  test('la vuelta de conectar Stripe abre Integraciones y enseña su aviso', async ({ page }) => {
    await panel(page);
    // Lo que manda /api/stripe/connect/callback al terminar. Sin `tab=`, como
    // antes del arreglo: el parámetro de conexión basta para saber a dónde ir.
    await page.goto('/configuracion?stripe_connected=1');

    await expect(page.getByRole('heading', { name: 'Integraciones del negocio' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Stripe conectado — ya puedes cobrar en tu propia cuenta')).toBeVisible();
    // El aviso se consume y la URL se queda en la pestaña: recargar no lo repite
    // ni devuelve a Clases y salas.
    await expect(page).toHaveURL(/\/configuracion\?tab=integraciones$/);
    await expect(pestanas(page).getByRole('button', { name: 'Integraciones', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('«Poner mi NIF ahora» baja hasta Datos fiscales', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=estudio&sub=general#datos-fiscales');

    await expect(page.locator('#datos-fiscales')).toBeInViewport({ timeout: 30_000 });
  });

  test('elegir pestaña y sub-pestaña queda en la URL, sin llenar el historial, y recargar lo mantiene', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion');
    const nav = pestanas(page);

    await expect(nav.getByRole('button', { name: 'Clases y salas', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
    const historialAntes = await page.evaluate(() => history.length);

    await nav.getByRole('button', { name: 'Integraciones', exact: true }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=integraciones$/);

    await nav.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.getByRole('tab', { name: 'Legal' }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=estudio&sub=legal$/);
    await expect(page.getByRole('tab', { name: 'Legal' })).toHaveAttribute('aria-selected', 'true');

    // `replace`, no `push`: tres clics no son tres pasos atrás.
    expect(await page.evaluate(() => history.length)).toBe(historialAntes);

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Legal' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(nav.getByRole('button', { name: 'Estudio', exact: true })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('La vuelta del pago de la suscripción', () => {
  async function suscripcion(page: Page, estado: Record<string, unknown>) {
    await panel(page);
    await page.route('**/api/billing/status**', route => json(route, estado));
  }

  const ACTIVA = {
    plan: 'ESTUDIO', subscriptionStatus: 'active', activo: true, configurado: true,
    esPropietaria: true, bloqueado: false, enPrueba: false, pruebaTermina: null,
    periodoTermina: '2026-10-15T10:00:00+00:00',
  };

  test('un Checkout que volvía a Configuración llega a Suscripción y dice lo que hay', async ({ page }) => {
    await suscripcion(page, ACTIVA);
    // La success_url vieja: una sesión de Stripe abierta antes del cambio.
    await page.goto('/configuracion?suscripcion=ok');

    await expect(page).toHaveURL(/\/suscripcion$/, { timeout: 30_000 });
    await expect(page.getByText('Listo: tu suscripción está activa.')).toBeVisible({ timeout: 30_000 });
  });

  test('si el webhook aún no ha llegado, no felicita: dice que está esperando', async ({ page }) => {
    let consultas = 0;
    await suscripcion(page, {});
    await page.route('**/api/billing/status**', route => {
      consultas++;
      return json(route, { ...ACTIVA, subscriptionStatus: null, activo: false });
    });
    await page.goto('/suscripcion?suscripcion=ok');

    await expect(page.getByText(/Estamos esperando su confirmación/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Listo: tu suscripción está activa.')).toHaveCount(0);
    // Y vuelve a preguntar en vez de quedarse con la primera respuesta.
    await expect.poll(() => consultas, { timeout: 15_000 }).toBeGreaterThan(1);
  });
});
