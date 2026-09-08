import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El estudio puede llamar a su moneda como quiera, y ese nombre tiene que
// LLEGAR a la base.
//
// Lo que se vigila aquí no es el input: es la lista blanca de columnas de
// `dbUpdateStudio`. En este repo, un campo que no se nombra ahí se tira en
// silencio y la pantalla enseña un toast de éxito — ya ha pasado con otras
// columnas, y es indistinguible de haber guardado bien hasta que recargas.
//
// El segundo test cubre la otra mitad de la regla: VOLVER a «créditos» desde un
// nombre propio guarda NULL, no el literal. Si se guardara el texto, ese estudio
// se quedaría congelado con esa palabra el día que el producto cambie la suya —
// y nadie entendería por qué a él no le cambió.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
  // La gamificación vive tras un PlanGate: sin plan de pago no se renderiza.
  plan: 'ESTUDIO', subscription_status: 'active',
  creditos_nombre: null,
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

/** Devuelve los cuerpos de los PATCH que salen hacia `studios`. */
async function base(page: Page, patches: Record<string, unknown>[], fila: Record<string, unknown> = STUDIO_ROW) {
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
      patches.push(JSON.parse(route.request().postData() ?? '{}'));
      return json(route, []);
    }
    return json(route, fila);
  });
  await seedSesionDeDuena(page);
}

async function abrirRecompensas(page: Page) {
  await page.goto('/configuracion?tab=gamificacion');
  await expect(page.getByRole('heading', { name: 'Logros y motivación' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Recompensas' }).click();
  return page.getByRole('textbox', { name: 'Nombre de tus créditos' });
}

test.describe('Cómo llama el estudio a sus créditos', () => {
  test('el nombre nuevo llega a la columna, no solo a la pantalla', async ({ page }) => {
    const patches: Record<string, unknown>[] = [];
    await base(page, patches);

    const campo = await abrirRecompensas(page);
    await expect(campo).toBeVisible({ timeout: 30_000 });
    await campo.fill('puntos');
    await campo.blur();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    // La columna, con su nombre de BD: es justo lo que la lista blanca omite.
    expect(patches[0]).toMatchObject({ creditos_nombre: 'puntos' });

    // Y la propia pestaña pasa a hablar en esa moneda, no solo el campo.
    await expect(page.getByRole('heading', { name: /puntos por acción/i })).toBeVisible();
  });

  test('volver a «créditos» guarda NULL, no el literal', async ({ page }) => {
    const patches: Record<string, unknown>[] = [];
    // Se parte de un estudio que YA tenía nombre propio: si partiera de NULL,
    // teclear «créditos» no sería un cambio y no habría nada que guardar (eso
    // lo cubre el tercer test).
    await base(page, patches, { ...STUDIO_ROW, creditos_nombre: 'puntos' });

    const campo = await abrirRecompensas(page);
    await expect(campo).toHaveValue('puntos', { timeout: 30_000 });
    await campo.fill('  Créditos  ');
    await campo.blur();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    // NULL y no el literal: guardarlo congelaría a ese estudio con esa palabra
    // el día que el producto cambie la suya.
    expect(patches[0]).toMatchObject({ creditos_nombre: null });
  });

  test('sin cambios reales no se escribe nada', async ({ page }) => {
    const patches: Record<string, unknown>[] = [];
    await base(page, patches);

    const campo = await abrirRecompensas(page);
    // Entrar y salir del campo sin tocarlo: el estudio ya tenía NULL.
    await campo.click();
    await campo.blur();

    // Un `await` corto y comprobar que sigue en cero: sin esto el test pasaría
    // aunque el PATCH saliera un instante después.
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(0);
  });
});
