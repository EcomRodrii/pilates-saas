import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// ⌘K también encuentra los ajustes de Configuración.
//
// Hasta el 15-sep el buscador global solo casaba con las pantallas del menú:
// «IVA», «NIF» o «lista de espera» no llevaban a nada, aunque el inicio de
// Configuración ya tenía su propio buscador de ajustes. El grupo «Ajustes» usa
// ese mismo buscador (lib/configuracion/buscar.ts, con sus tests unitarios).
// Esto comprueba lo que esos tests no ven:
//   · desde otra pantalla, elegir un ajuste abre su sección y baja a su tarjeta;
//   · ya dentro de Configuración, la URL cambia de verdad: va por el shell y no
//     por el router, que en producción dejaba la dirección vieja (#2030);
//   · quien no entra en Configuración (recepción) no ve el grupo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR', nif: 'B00000000',
  plan: 'ESTUDIO', subscription_status: 'active',
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function panel(page: Page, { comoRecepcion = false } = {}) {
  // Playwright resuelve las rutas en orden INVERSO: comodines primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // Con recepción, la dueña es OTRA persona y la sesión es de su ficha de equipo.
  await page.route('**/rest/v1/studios**', route =>
    json(route, comoRecepcion ? { ...STUDIO_ROW, owner_auth_user_id: 'auth-otra-duena' } : STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, comoRecepcion
    ? [{ id: 'ins-recepcion', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: AUTH_UID }]
    : []));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

// El disparador de verdad es el botón de la barra superior (ver
// e2e/buscador-global-secciones.spec.ts): el del menú lateral no está en todas.
async function abrirBuscador(page: Page) {
  await page.getByRole('button', { name: /Qué quieres hacer o buscar/ }).click({ timeout: 30_000 });
  const input = page.getByPlaceholder('¿Qué quieres hacer? O busca una clienta, clase o pago…');
  await expect(input).toBeVisible();
  return input;
}

const tituloSeccion = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

test.describe('⌘K encuentra los ajustes de Configuración', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('desde Inicio, «IVA» lleva a Datos fiscales e IVA, en Cobros y facturas', async ({ page }) => {
    await panel(page);
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('IVA');
    await expect(page.getByText('Ajustes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Datos fiscales e IVA\s*Cobros y facturas$/ }).click();

    await expect(page).toHaveURL(/\/configuracion\?tab=cobros#datos-fiscales$/, { timeout: 30_000 });
    await expect(input).toBeHidden();
    await expect(tituloSeccion(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 3, name: 'Datos fiscales e IVA', exact: true })).toBeInViewport({ timeout: 15_000 });
  });

  test('ya en Configuración, «lista de espera» cambia de sección y la URL la sigue', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=estudio');
    await expect(tituloSeccion(page, 'Mi estudio')).toBeVisible({ timeout: 30_000 });

    const input = await abrirBuscador(page);
    await input.fill('lista de espera');
    await page.getByRole('button', { name: /^Lista de espera\s*Cómo reservan mis alumnas$/ }).click();

    await expect(input).toBeHidden();
    await expect(tituloSeccion(page, 'Cómo reservan mis alumnas')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/configuracion\?tab=reservas#lista-de-espera$/);
    await expect(page.locator('#lista-de-espera')).toBeInViewport({ timeout: 15_000 });
    // Al cerrarse, ⌘K devuelve el foco a su botón; el shell lo lleva después a
    // la tarjeta. Si el orden se invirtiera, el teclado se quedaría arriba.
    await expect(page.locator('#lista-de-espera-titulo')).toBeFocused({ timeout: 15_000 });
  });

  test('recepción no ve el grupo «Ajustes»', async ({ page }) => {
    await panel(page, { comoRecepcion: true });
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('IVA');
    // Primero algo que demuestre que la búsqueda ya corrió: sin eso, «no está»
    // pasaría también antes de buscar. Recepción sí encuentra la acción de
    // facturar («iva» es una de sus claves), que no sale con la caja vacía.
    await expect(page.getByRole('button', { name: /Emitir una factura/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dar de alta a una clienta/ })).toHaveCount(0);
    await expect(page.getByText('Ajustes', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Datos fiscales e IVA/ })).toHaveCount(0);
  });
});
