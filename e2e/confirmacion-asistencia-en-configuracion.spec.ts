import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Pedir confirmación a quien suele no venir», ahora entre las reglas de
// reserva.
//
// Vivía sola en Centro de Control, bajo un desplegable cerrado por defecto: se
// cancelaban reservas y la propietaria no encontraba dónde se decidía eso.
//
// Lo que este test protege no es la mudanza, es lo que la mudanza podía romper:
// esa columna solo la escribe `/api/decisiones/confirmacion-riesgo`, que exige
// rol y plan. Enchufarla al `updateStudio` del resto de la pestaña —un UPDATE
// del cliente contra la RLS— habría regalado una función de plan sin que se
// notara, y un 403 habría dejado un interruptor que se pulsa y no hace nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function abrir(page: Page, opts: { conPlan: boolean }) {
  const puts: unknown[] = [];
  const patches: string[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
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
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postData() ?? '');
      return json(route, [], 200);
    }
    return json(route, STUDIO_ROW);
  });
  // ⚠️ Después del comodín `**/api/**`: Playwright prueba las rutas en orden
  // INVERSO al registro, así que puesta antes no la vería nadie.
  await page.route('**/api/decisiones/confirmacion-riesgo', route => {
    if (!opts.conPlan) return json(route, { error: 'Tu plan no incluye el Centro de Control' }, 403);
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON());
      return json(route, route.request().postDataJSON());
    }
    return json(route, { activo: false });
  });

  await page.goto('/configuracion?tab=estudio&sub=reservas');
  return { puts, patches };
}

test('el interruptor vive con las reglas de reserva y guarda por su endpoint', async ({ page }) => {
  const { puts, patches } = await abrir(page, { conPlan: true });

  const fila = page.getByText('Pedir confirmación a quien suele no venir');
  await expect(fila).toBeVisible({ timeout: 30_000 });
  // La letra pequeña tiene que decir a quién se le pide: «se cancela la reserva»
  // sin ese matiz se lee como que le pasa a cualquiera que reserve.
  await expect(page.getByText(/No se le pide a todo el mundo/)).toBeVisible();

  await fila.click();

  // Guarda al pulsar, sin pasar por el botón de abajo.
  await expect.poll(() => puts.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(puts[puts.length - 1]).toEqual({ activo: true });

  // ⚠️ Y NO viaja en el PATCH de `studios`: por ahí no hay comprobación de plan.
  expect(patches.join(' ')).not.toContain('pedir_confirmacion_riesgo');
});

test('sin plan no se pulsa, y se dice por qué', async ({ page }) => {
  const { puts } = await abrir(page, { conPlan: false });

  const fila = page.getByText('Pedir confirmación a quien suele no venir');
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Esta regla va con el Centro de Control/)).toBeVisible();

  // Deshabilitado DE VERDAD, no solo apagado: un interruptor que se deja pulsar
  // y no hace nada es indistinguible de uno roto.
  const boton = page.locator('label', { hasText: 'Pedir confirmación a quien suele no venir' })
    .getByRole('button').first();
  await expect(boton).toBeDisabled();

  // Y ni forzando el clic sale una escritura.
  await boton.click({ force: true });
  await page.waitForTimeout(1500);
  expect(puts, 'sin plan no puede salir ninguna escritura').toHaveLength(0);
});

