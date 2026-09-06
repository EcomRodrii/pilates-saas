import { test, expect, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El interruptor «No dejar reservar con un pago fallido» tiene que LLEGAR a la
// base de datos.
//
// `dbUpdateStudio` mapea campo a campo con una lista blanca de `if (... in
// changes)`. Un campo que no esté en ella se descarta en silencio y la pantalla
// dice «guardado» igual. Ya ha pasado dos veces en este repo (y hay un
// comentario en el propio fichero sobre una tercera, la de desconectar Stripe).
//
// Por eso este test NO mira el toast: mira el cuerpo del PATCH que sale hacia
// `studios`. Un test que solo comprobara el mensaje de éxito pasaría con el
// campo tirado, que es exactamente el bug.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  bloquear_reserva_impago: false,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function abrirReservas(page: import('@playwright/test').Page, patches: string[]) {

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

  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }));
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

  await page.goto('/configuracion?tab=estudio&sub=reservas');
}

test('el interruptor de impago llega hasta la columna, no solo al toast', async ({ page }) => {
  const patches: string[] = [];
  await abrirReservas(page, patches);

  const toggle = page.getByText('No dejar reservar con un pago fallido');
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await toggle.click();

  await page.getByRole('button', { name: /Guardar/ }).first().click();

  await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const cuerpo = patches.join(' ');
  expect(cuerpo, 'el campo no viaja en el PATCH: la lista blanca se lo comió').toContain('bloquear_reserva_impago');
  expect(JSON.parse(patches[patches.length - 1]).bloquear_reserva_impago).toBe(true);
});

test('el interruptor de recuperaciones automáticas también llega a la columna', async ({ page }) => {
  const patches: string[] = [];
  await abrirReservas(page, patches);

  const toggle = page.getByText('Dar recuperaciones solas al cerrar la semana');
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await toggle.click();
  await page.getByRole('button', { name: /Guardar/ }).first().click();

  await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(patches.join(' '), 'la lista blanca se comió el campo').toContain('recuperacion_auto_semanal');
  expect(JSON.parse(patches[patches.length - 1]).recuperacion_auto_semanal).toBe(true);
});
