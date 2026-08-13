import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Solicitudes de contacto recibidas por una instructora (app/network/
// solicitudes/page.tsx) — cuenta de Network independiente, sin studio_id
// (docs/NETWORK-AUDIT-2.md §4), fuera de app/(dashboard). Cubre aceptar una
// solicitud con éxito y el camino de fallo del servidor, con contador de
// intentos (mismo criterio que .claude/tentare-os.md sobre el punto ciego
// histórico de "ningún test veía un 4xx").
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-instructora';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const SOLICITUD_PENDIENTE = {
  id: 'redcontacto-1', studioId: 'studio-x', estudioNombre: 'Pilates Sur', estudioCiudad: 'Sevilla',
  mensaje: '¿Estás disponible para sustituciones los lunes?',
  estado: 'pendiente', creadoEn: '2026-08-01T09:00:00Z', resueltoEn: null,
};

async function montarSolicitudes(page: Page, opts: { resolverStatus?: number } = {}) {
  const { resolverStatus = 200 } = opts;
  let intentosResolver = 0;

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'ana@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/network/contacto', route => {
    if (route.request().method() === 'GET') return json(route, { solicitudes: [SOLICITUD_PENDIENTE] });
    return route.continue();
  });

  await page.route('**/api/network/contacto/resolver', route => {
    intentosResolver++;
    return resolverStatus === 200
      ? json(route, { ok: true })
      : json(route, { error: 'No se ha podido resolver la solicitud.' }, resolverStatus);
  });

  return { intentosResolver: () => intentosResolver };
}

test.describe('Solicitudes de contacto (instructora)', () => {
  test('acepta una solicitud pendiente y pasa a "Aceptada"', async ({ page }) => {
    await montarSolicitudes(page);
    await page.goto('/network/solicitudes');

    await expect(page.getByText('Pilates Sur · Sevilla')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Pendiente')).toBeVisible();

    await page.getByRole('button', { name: /^Aceptar$/ }).click();

    await expect(page.getByText('Aceptada', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Aceptar$/ })).toHaveCount(0);
  });

  test('si el servidor rechaza la aceptación, la solicitud sigue pendiente de verdad', async ({ page }) => {
    const { intentosResolver } = await montarSolicitudes(page, { resolverStatus: 500 });
    await page.goto('/network/solicitudes');

    await page.getByRole('button', { name: /^Aceptar$/ }).click();

    // Sigue pendiente — nunca "Aceptada" con un 500 real detrás.
    await expect(page.getByText('Aceptada')).toHaveCount(0);
    await expect(page.getByText('Pendiente')).toBeVisible({ timeout: 10_000 });

    expect(intentosResolver()).toBeGreaterThan(0);
  });
});
