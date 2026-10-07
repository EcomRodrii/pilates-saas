import { test, expect, type Page, type Route } from '@playwright/test';

// Punto 3 del empujón al onboarding: lo que se pregunta tiene que acabar
// CONFIGURANDO algo. Este spec vigila el camino completo de las dos piezas que
// faltaban — «Clase suelta», que se ofrecía y se tiraba, y la ficha de la
// propietaria— comprobando lo que sale hacia /api/onboarding/configurar.
const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  const configurar: Record<string, unknown>[] = [];
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

  // ⚠️ El catch-all va PRIMERO y la ruta concreta DESPUÉS: Playwright resuelve
  // las rutas en orden inverso al de registro, así que la última registrada
  // gana. Al revés, `**/api/**` se tragaba la llamada a configurar y el
  // contador se quedaba a cero — que se lee igual que «el asistente no la
  // manda», y no lo era.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/onboarding/configurar', route => {
    configurar.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, { ok: true });
  });
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    // El UPDATE que sella la bienvenida pide `select=id` y cuenta filas: con un
    // objeto suelto (o `[]`) cuenta como no guardado y el asistente no sale.
    route.request().method() === 'PATCH'
      ? json(route, [{ id: STUDIO_ID }])
      : json(route, {
        id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
        owner_auth_user_id: AUTH_UID, bienvenida_vista_en: null,
      }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
  // Las pantallas de valor van delante; se saltan para llegar al asistente.
  await page.getByRole('button', { name: 'Saltar' }).click({ timeout: 30_000 });
  return { configurar };
}

/** Pantalla 1 → 2 → 3 del asistente rápido, pulsando «Continuar». */
async function aPantalla(page: Page, n: 2 | 3) {
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tus clases y tu sala' })).toBeVisible();
  if (n === 3) {
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Antes de entrar' })).toBeVisible();
  }
}

test('«Clase suelta» y «doy clases» llegan al ejecutor, no se quedan por el camino', async ({ page }) => {
  const { configurar } = await montar(page);
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible({ timeout: 30_000 });
  await aPantalla(page, 2);
  await page.getByRole('radio', { name: 'Sí, yo doy clases' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Clase suelta' }).click();
  await page.getByRole('button', { name: 'Ver mi estudio' }).click();

  await expect.poll(() => configurar.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const cuerpo = configurar.at(-1)!;
  expect(cuerpo.usaClaseSuelta).toBe(true);
  expect(cuerpo.imparteClases).toBe(true);
});

// El asistente son tres pantallas con lo más común ya marcado: con solo
// «Continuar» el estudio queda MONTADO (una sala, ocho plazas, 55 minutos,
// Reformer y Mat), y lo que no se contestó no se inventa. Con contador: saltar
// NO puede significar «no guardar lo que ya contestó».
test('«Saltar y ver mi estudio» monta lo marcado por defecto y no inventa cobro, horario ni ficha', async ({ page }) => {
  const { configurar } = await montar(page);
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Saltar y ver mi estudio' }).click();

  await expect.poll(() => configurar.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const cuerpo = configurar.at(-1)!;
  expect(cuerpo.tiposClase).toEqual(['Reformer', 'Mat']);
  expect(cuerpo.numSalas).toBe(1);
  expect(cuerpo.aforosPorSala).toEqual([8]);
  expect(cuerpo.duracionMinutos).toBe(55);
  // Lo que no se contestó no se inventa.
  expect(cuerpo.usaBonos).toBe(false);
  expect(cuerpo.usaMembresias).toBe(false);
  expect(cuerpo.usaClaseSuelta).toBe(false);
  expect(cuerpo.imparteClases).toBe(false);
  expect(cuerpo.horaApertura).toBeUndefined();
  // Y llega a la pantalla final, con su app.
  await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
});

test('lo opcional (cobro, prioridad, ayuda) solo está en la última pantalla y se deja en blanco', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('¿Cómo cobras a tus alumnas?')).toHaveCount(0);
  await aPantalla(page, 3);
  await expect(page.getByText('¿Cómo cobras a tus alumnas?')).toBeVisible();
  await expect(page.getByText('¿Cómo prefieres que te ayudemos?')).toBeVisible();
  // En blanco también vale: se llega a la pantalla final sin contestar nada.
  await page.getByRole('button', { name: 'Ver mi estudio' }).click();
  await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
});
