import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Avisos de integrador de Urban Sports Club en Conexiones (Provider ID
// automático). Nada se conecta sin que la propietaria lo confirme, y la pantalla
// nunca dice «Conectada» si el servidor dijo que no. Cada camino de fallo lleva
// su contador de peticiones: un «no mintió» sin petición no prueba nada
// (`expect(intentos).toBeGreaterThan(0)`), y el contador del PUT de la
// configuración tiene que seguir a 0.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Opciones {
  /** Respuesta del GET de avisos. `null` = 404 (apagado o nada que contar). */
  aviso: { situacion: string; nombre: string | null; fin: string | null } | null;
  /** Qué hace el POST de avisos. */
  post?: (route: Route) => Promise<void> | void;
}

async function montar(page: Page, opts: Opciones) {
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

  const c = { gets: 0, posts: [] as unknown[], puts: 0 };
  // Registradas al final para ganar al comodín `**/api/**`.
  await page.route('**/api/integrations/config**', async route => {
    if (route.request().method() === 'PUT') { c.puts++; return json(route, { ok: true }); }
    return json(route, { config: { modo: 'manual' }, apiDisponible: true, ventaCortada: null });
  });
  await page.route('**/api/plataformas/usc/avisos', async route => {
    if (route.request().method() === 'GET') {
      c.gets++;
      return opts.aviso ? json(route, { aviso: opts.aviso }) : json(route, { error: 'No encontrado' }, 404);
    }
    c.posts.push(route.request().postDataJSON());
    return opts.post ? opts.post(route) : json(route, { ok: true });
  });

  await page.goto('/configuracion?tab=conexiones');
  await page.locator('#plataformas-externas').click({ timeout: 30_000 });
  return c;
}

const PENDIENTE = { situacion: 'pendiente', nombre: 'Estudio Ejemplo', fin: null };
const tarjeta = (page: Page) => page.getByTestId('aviso-usc');
const conectar = (page: Page) => tarjeta(page).getByRole('button', { name: 'Sí, es mi centro: conectar' });

test.describe('Urban Sports Club: avisos de integrador', () => {
  test('pendiente: pregunta si es su centro y no conecta nada por sí sola', async ({ page }) => {
    const c = await montar(page, { aviso: PENDIENTE });
    await expect(tarjeta(page)).toContainText('ha dado de alta «Estudio Ejemplo». ¿Es el tuyo?');
    expect(c.gets).toBeGreaterThan(0);
    expect(c.posts).toHaveLength(0);
    expect(c.puts).toBe(0);
  });

  for (const [nombre, respuesta] of [
    ['400', (r: Route) => json(r, { error: 'Acción no válida' }, 400)],
    ['409', (r: Route) => json(r, { error: 'Urban Sports Club todavía no ha publicado tu ubicación. No hemos cambiado nada: te lo diremos aquí cuando aparezca.' }, 409)],
    ['500', (r: Route) => json(r, { error: 'No se ha podido guardar la conexión. No hemos cambiado nada. Inténtalo de nuevo.' }, 500)],
    ['red caída', (r: Route) => r.abort('failed')],
  ] as const) {
    test(`confirmar con ${nombre}: lo dice, no anuncia «Conectada» y no escribe la configuración`, async ({ page }) => {
      const c = await montar(page, { aviso: PENDIENTE, post: respuesta });
      await conectar(page).click();
      await expect(tarjeta(page).getByRole('alert')).toBeVisible();
      await expect(tarjeta(page)).not.toContainText('Conectada');
      await expect(conectar(page)).toBeVisible();
      expect(c.posts.length).toBeGreaterThan(0);
      expect(c.puts).toBe(0);
    });
  }

  test('confirmar bien: «Conectada» solo cuando el servidor dijo que sí', async ({ page }) => {
    const c = await montar(page, { aviso: PENDIENTE });
    await conectar(page).click();
    await expect(tarjeta(page)).toContainText('Conectada.');
    expect(c.posts).toEqual([{ accion: 'confirmar' }]);
  });

  test('doble clic: una sola petición', async ({ page }) => {
    const c = await montar(page, {
      aviso: PENDIENTE,
      post: async route => { await new Promise(r => setTimeout(r, 400)); await json(route, { ok: true }); },
    });
    await conectar(page).dblclick();
    await expect(tarjeta(page)).toContainText('Conectada.');
    expect(c.posts).toHaveLength(1);
  });

  test('apagado o sin nada que contar (404): no hay tarjeta', async ({ page }) => {
    const c = await montar(page, { aviso: null });
    await expect(page.getByTestId('conexion-usc')).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
    expect(c.gets).toBeGreaterThan(0);
  });

  test('conflicto y baja: avisan sin botones de conectar y sin cambiar nada', async ({ page }) => {
    const c = await montar(page, { aviso: { situacion: 'conflicto', nombre: 'Otro Centro', fin: null } });
    await expect(tarjeta(page)).toContainText('No hemos cambiado nada');
    await expect(tarjeta(page).getByRole('button')).toHaveCount(0);
    expect(c.gets).toBeGreaterThan(0);
    expect(c.puts).toBe(0);
  });
});
