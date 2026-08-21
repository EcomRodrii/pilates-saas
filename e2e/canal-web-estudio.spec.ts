import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Canales del estudio — la mitad que NO vive en el tema: la WEB.
//
// Una web no es una red social: es un dato de contacto, hermano del teléfono y
// del email, y por eso es una columna de `studios` (`sitio_web`, migr
// 20260821101500) y se edita aquí, junto a ellos — ver lib/canales-estudio.ts.
//
// Lo que prueba: que lo tecleado llega al PATCH de `studios` con el nombre de
// columna correcto, y que al volver a la pantalla sigue ahí. Un mapeo olvidado
// en `dbUpdateStudio` no falla: dice «guardado» y se pierde en silencio, que es
// exactamente el fallo que este repo ya se ha comido varias veces.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, sitioWebGuardado: string | null = null) {
  const patches: Record<string, unknown>[] = [];
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
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, []);
    }
    return json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: AUTH_UID, sitio_web: sitioWebGuardado,
    });
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion?tab=estudio');
  return { patches };
}

test.describe('La web del estudio, junto al teléfono y el email', () => {
  test('lo escrito se guarda en la columna sitio_web', async ({ page }) => {
    const { patches } = await montar(page);

    const web = page.getByRole('textbox', { name: 'Web' });
    await expect(web).toBeVisible({ timeout: 30_000 });
    await web.fill('estudiocarmen.es');

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/rest/v1/studios') && r.method() === 'PATCH'),
      page.getByRole('button', { name: 'Guardar datos del estudio' }).click(),
    ]);
    expect(patches.at(-1)!.sitio_web).toBe('estudiocarmen.es');
  });

  test('una web ya guardada se recupera al abrir la pantalla', async ({ page }) => {
    await montar(page, 'estudiocarmen.es');
    await expect(page.getByRole('textbox', { name: 'Web' })).toHaveValue('estudiocarmen.es', { timeout: 30_000 });
  });

  // Vaciar la casilla tiene que significar «no tengo web», no una cadena vacía:
  // quien decide si pintar el enlace distingue null de ''.
  test('vaciar la casilla guarda NULL, no una cadena vacía', async ({ page }) => {
    const { patches } = await montar(page, 'estudiocarmen.es');
    const web = page.getByRole('textbox', { name: 'Web' });
    await expect(web).toHaveValue('estudiocarmen.es', { timeout: 30_000 });
    await web.fill('   ');

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/rest/v1/studios') && r.method() === 'PATCH'),
      page.getByRole('button', { name: 'Guardar datos del estudio' }).click(),
    ]);
    expect(patches.at(-1)!.sitio_web).toBeNull();
  });
});
