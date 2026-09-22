import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "¿En qué sede estoy?"
//
// El nombre de la sede activa no salía en NINGUNA pantalla del panel y el
// selector vivía dentro del menú del avatar. En la prueba con una dueña de dos
// centros la app cambió de sede sola (al quedarse sin la activa) y el dashboard
// pasó de 0 € a 3.240 € sin decir de quién eran. Con dos centros eso es cobrar,
// cancelar o borrar en el sitio equivocado.
//
// Contrato que fija esta suite:
//   1. con varias sedes, el nombre de la activa está SIEMPRE a la vista;
//   2. con una sola sede no se pinta nada (no hay ambigüedad que resolver);
//   3. al cambiar, se confirma — porque el destino se ve idéntico al origen.
//
// Env dummy y backend interceptado, como guardar-salas.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-centro';
const STUDIO_ID_2 = 'studio-norte';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Pilates Centro',
  slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID,
  email: 'cloe@example.com',
  moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token',
      refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800,
      expires_in: 999999999,
      token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/** `sedes` es lo que devuelve mis_estudios(): una o varias según el test. */
async function mockBackend(page: Page, sedes: { id: string; nombre: string }[]) {
  const cambios: unknown[] = [];

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/mis_estudios', route => json(route, sedes));
  // Escribir la sede activa es un upsert sobre sesion_activa.
  await page.route('**/rest/v1/sesion_activa**', async route => {
    if (route.request().method() !== 'GET') cambios.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, []);
  });

  return { cambios };
}

const DOS_SEDES = [{ id: STUDIO_ID, nombre: 'Pilates Centro' }, { id: STUDIO_ID_2, nombre: 'Pilates Norte' }];

test.describe('Sede activa siempre visible', () => {
  test('con dos sedes, el nombre de la activa se ve sin abrir ningún menú', async ({ page }) => {
    await mockBackend(page, DOS_SEDES);
    await seedSesionDeDuena(page);
    await page.goto('/dashboard');

    // Sin tocar nada: el rótulo y el nombre están en pantalla.
    const selector = page.getByRole('button', { name: /Sede activa: Pilates Centro/ });
    await expect(selector).toBeVisible({ timeout: 30_000 });
    await expect(selector).toContainText('Pilates Centro');
  });

  test('el selector abre desde ahí mismo y lista las dos sedes', async ({ page }) => {
    await mockBackend(page, DOS_SEDES);
    await seedSesionDeDuena(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /Sede activa: Pilates Centro/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /Pilates Centro/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Pilates Norte/ })).toBeVisible();
  });

  test('con una sola sede no se pinta nada (no hay nada que desambiguar)', async ({ page }) => {
    await mockBackend(page, [{ id: STUDIO_ID, nombre: 'Pilates Centro' }]);
    await seedSesionDeDuena(page);
    await page.goto('/dashboard');

    // Esperar a que el panel esté montado antes de afirmar una ausencia.
    await expect(page.getByRole('button', { name: 'Abrir menú de perfil' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Sede activa:/ })).toHaveCount(0);
  });

  test('al cambiar de sede se confirma en la pantalla de destino', async ({ page }) => {
    await mockBackend(page, DOS_SEDES);
    await seedSesionDeDuena(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /Sede activa: Pilates Centro/ }).click();
    await page.getByRole('menuitem', { name: /Pilates Norte/ }).click();

    // El cambio hace un hard-nav a /dashboard, que se ve idéntico: sin este
    // aviso no hay forma de saber que has cambiado de centro.
    // Se filtra por texto porque el skeleton de carga del panel también es un
    // role="status" y el selector a secas resolvía a dos elementos.
    const confirmacion = page.getByRole('status').filter({ hasText: 'Ahora estás en' });
    await expect(confirmacion).toContainText('Ahora estás en Pilates Norte', { timeout: 30_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pestañas desfasadas (visto en producción, 22-sep-2026): se cambiaba de sede
// desde Configuración, una pestaña abierta seguía enseñando la sede anterior y
// todo lo que se guardaba ahí lo rechazaba la RLS («tu usuario no puede cambiar
// los datos de este estudio»). Solo el selector de la barra avisaba a las demás
// pestañas; y si la sede cambiaba desde otro dispositivo, ninguna se enteraba.
// Servidor simulado con estado: `activa` es lo que diría current_studio_id().
// ─────────────────────────────────────────────────────────────────────────────
async function backendConEstado(page: Page, estado: { activa: string }) {
  const filas: Record<string, typeof STUDIO_ROW> = {
    [STUDIO_ID]: STUDIO_ROW,
    [STUDIO_ID_2]: { ...STUDIO_ROW, id: STUDIO_ID_2, nombre: 'Pilates Norte', slug: 'pilates-norte' },
  };
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, filas[estado.activa]));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, estado.activa));
  await page.route('**/rest/v1/rpc/mis_estudios', route => json(route, DOS_SEDES));
  await page.route('**/rest/v1/sesion_activa**', async route => {
    if (route.request().method() !== 'GET') {
      const cuerpo = JSON.parse(route.request().postData() || '{}') as { studio_id?: string };
      if (cuerpo.studio_id) estado.activa = cuerpo.studio_id;
    }
    return json(route, []);
  });
}

test.describe('Ninguna pestaña se queda en la sede anterior', () => {
  test('cambiar de sede desde Configuración pasa también a las demás pestañas', async ({ context }) => {
    const estado = { activa: STUDIO_ID };
    const vieja = await context.newPage();
    const nueva = await context.newPage();
    for (const p of [vieja, nueva]) { await backendConEstado(p, estado); await seedSesionDeDuena(p); }

    await vieja.goto('/dashboard');
    await expect(vieja.getByRole('button', { name: /Sede activa: Pilates Centro/ })).toBeVisible({ timeout: 30_000 });

    await nueva.goto('/configuracion?tab=estudio&sub=sedes');
    await expect(nueva.getByRole('heading', { name: 'Tus sedes' })).toBeVisible({ timeout: 30_000 });
    await nueva.getByRole('button', { name: 'Cambiarme' }).click();
    await expect(nueva.getByRole('status').filter({ hasText: 'Ahora estás en' })).toContainText('Pilates Norte', { timeout: 30_000 });

    // La otra pestaña se recarga sola en la sede nueva.
    await expect(vieja.getByRole('button', { name: /Sede activa: Pilates Norte/ })).toBeVisible({ timeout: 30_000 });
  });

  test('si la sede cambió desde otro dispositivo, al volver a la pestaña se recarga en la buena', async ({ page }) => {
    const estado = { activa: STUDIO_ID };
    await backendConEstado(page, estado);
    await seedSesionDeDuena(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /Sede activa: Pilates Centro/ })).toBeVisible({ timeout: 30_000 });

    estado.activa = STUDIO_ID_2; // otro dispositivo: ninguna pestaña de este navegador avisa
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: /Sede activa: Pilates Norte/ })).toBeVisible({ timeout: 30_000 });
  });

  test('sin cambio de sede, volver a la pestaña no recarga nada', async ({ page }) => {
    const estado = { activa: STUDIO_ID };
    await backendConEstado(page, estado);
    await seedSesionDeDuena(page);
    let consultas = 0;
    await page.route('**/rest/v1/rpc/current_studio_id', route => { consultas++; return json(route, estado.activa); });
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /Sede activa: Pilates Centro/ })).toBeVisible({ timeout: 30_000 });
    const antes = consultas;
    await page.evaluate(() => { (window as unknown as { __marca: number }).__marca = 1; window.dispatchEvent(new Event('focus')); });
    await expect.poll(() => consultas).toBeGreaterThan(antes); // sí lo comprobó…
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __marca?: number }).__marca)).toBe(1); // …y no recargó
  });
});
