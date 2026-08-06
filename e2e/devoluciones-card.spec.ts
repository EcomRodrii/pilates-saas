import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La card de devoluciones: lo que decide si la propietaria pulsa con criterio.
//
// La reversión NO es automática a propósito — el doble cargo es una de las
// causas más frecuentes de reembolso, y ahí deshacer le quitaría a la socia las
// sesiones que sí pagó. Así que lo importante de esta pantalla no es el botón:
// es que los números y los avisos estén DELANTE antes de pulsarlo, y que el
// botón NO aparezca cuando deshacer ya no sería exacto.
//
// Nada de esto lo cubre un test unitario: `calcularReversion` está probada
// aparte, pero que su resultado llegue a la pantalla —y que el botón se pinte o
// no— solo se ve montando la página.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Una devolución total de un bono de 10 que la socia ya ha empezado a usar. */
function devolucion(over: Record<string, unknown> = {}) {
  return {
    id: 'dev-1', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: 'sus-1',
    recibo_id: 'rec-1', origen: 'REEMBOLSO_TOTAL',
    importe_cobrado: 165, importe_devuelto: 165,
    detectada_en: '2026-08-06T09:00:00+00:00', estado: 'PENDIENTE_REVISION',
    ...over,
  };
}

/** El snapshot del recibo: qué entregó el cobro. */
function recibo(over: Record<string, unknown> = {}) {
  return {
    id: 'rec-1', entrega_tipo: 'BONO', entrega_aplicada: true,
    entrega_sesiones_antes: 0, entrega_sesiones_despues: 10,
    entrega_fecha_fin_antes: '2026-09-01', entrega_fecha_fin_despues: '2026-09-01',
    entrega_estado_antes: 'EXPIRADA',
    ...over,
  };
}

async function montar(page: Page, opts: {
  devoluciones: Record<string, unknown>[];
  recibos: Record<string, unknown>[];
  suscripciones?: Record<string, unknown>[];
}) {
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
  await page.route('**/rest/v1/devoluciones**', route => json(route, opts.devoluciones));
  await page.route('**/rest/v1/recibos**', route => json(route, opts.recibos));
  await page.route('**/rest/v1/suscripciones**', route =>
    json(route, opts.suscripciones ?? [{ id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 7, fecha_fin: '2026-09-01', estado: 'ACTIVA' }]));
  await page.route('**/rest/v1/socios**', route => json(route, [{ id: 'soc-1', nombre: 'María', apellidos: 'Soler' }]));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [{ id: 'plan-1', nombre: 'Bono 10' }]));

  await page.goto('/dashboard');
}

test.describe('Devoluciones por revisar', () => {
  test('el aviso de sesiones consumidas está delante del botón', async ({ page }) => {
    // Es lo que hace que la propietaria elija un reembolso parcial en Stripe en
    // vez de deshacer y dejar 3 clases sin pagar.
    await montar(page, { devoluciones: [devolucion()], recibos: [recibo()] });

    await expect(page.getByText(/1 devolución por revisar/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/María Soler/)).toBeVisible();
    await expect(page.getByText(/Ha usado 3 sesiones desde el cobro/i)).toBeVisible();
    await expect(page.getByText(/sin pagar/i)).toBeVisible();
    // Y se ve QUÉ se va a escribir antes de pulsar.
    await expect(page.getByText(/7 → 0/)).toBeVisible();
  });

  test('si la suscripción se ha movido, NO se ofrece deshacer', async ({ page }) => {
    // Saldo por encima de lo que dejó la entrega: alguien recargó por otro lado.
    // Deshacer ya no sería exacto, así que solo queda revisarlo a mano.
    await montar(page, {
      devoluciones: [devolucion()], recibos: [recibo()],
      suscripciones: [{ id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 15, fecha_fin: '2026-09-01', estado: 'ACTIVA' }],
    });

    await expect(page.getByText(/ha cambiado desde el cobro/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Revertir la entrega/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Marcar revisada/i })).toBeVisible();
  });

  test('un cobro que no entregó nada no ofrece deshacer, y dice por qué', async ({ page }) => {
    await montar(page, {
      devoluciones: [devolucion()],
      recibos: [recibo({ entrega_aplicada: false })],
    });

    await expect(page.getByText(/no entregó nada/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Revertir la entrega/i })).toHaveCount(0);
  });

  test('un cobro anterior al registro de entregas dice que no se sabe', async ({ page }) => {
    // "No lo sé" NO es "no entregó": prometer exactitud aquí sería mentir.
    await montar(page, {
      devoluciones: [devolucion()],
      recibos: [recibo({ entrega_aplicada: null })],
    });

    await expect(page.getByText(/no se sabe qué entregó/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Revertir la entrega/i })).toHaveCount(0);
  });

  test('"No revertir" está tan a mano como revertir', async ({ page }) => {
    // En un doble cargo —causa frecuente de reembolso— NO revertir es la
    // respuesta correcta, así que no puede costar más que la otra.
    await montar(page, { devoluciones: [devolucion()], recibos: [recibo()] });

    await expect(page.getByRole('button', { name: /Revertir la entrega/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^No revertir$/i })).toBeVisible();
  });

  test('sin devoluciones pendientes la card no existe', async ({ page }) => {
    await montar(page, { devoluciones: [], recibos: [] });
    await expect(page.getByText(/devoluciones? por revisar/i)).toHaveCount(0);
  });
});
