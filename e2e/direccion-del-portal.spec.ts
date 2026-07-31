import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La dirección del portal se generaba una vez y no se podía cambiar nunca más.
//
// El slug sale del nombre al crear el estudio. Después `dbUpdateStudio`
// actualiza el nombre y NUNCA el slug: un estudio que se rebautiza se queda con
// la dirección vieja para siempre. Y ni siquiera se veía escrita — en
// Configuración solo había un enlace para abrirla.
//
// Lo tentador era regenerarla al renombrar, y habría sido mucho peor: esa
// dirección está en la bio de Instagram, en el QR de la puerta y en cada
// WhatsApp que el estudio ha mandado.
//
// Así que se cambia a mano, y la anterior SIGUE FUNCIONANDO (0115). Esto es lo
// que convierte «cambiar la dirección» en algo que alguien con un negocio en
// marcha se atreve a tocar.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Boutique Mar', slug: 'pilates-boutique-mar',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
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

async function mockBackend(page: Page, opts: { fallaCambio?: { status: number; body: unknown } } = {}) {
  const cambios: Record<string, unknown>[] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/estudio/direccion**', async route => {
    if (opts.fallaCambio) return json(route, opts.fallaCambio.body, opts.fallaCambio.status);
    const enviado = JSON.parse(route.request().postData() || '{}');
    cambios.push(enviado);
    return json(route, { ok: true, slug: enviado.slug, anterior: STUDIO_ROW.slug });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  return { cambios };
}

async function abrirEstudio(page: Page) {
  await page.goto('/configuracion?tab=estudio&sub=enlaces');
  await expect(page.getByText('/reservar/pilates-boutique-mar').first())
    .toBeVisible({ timeout: 30_000 });
}

test.describe('La dirección del portal', () => {
  test('se puede ver escrita, no solo abrir', async ({ page }) => {
    // Antes solo había un enlace: para saber tu propia dirección tenías que
    // abrirla y leerla en la barra del navegador.
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirEstudio(page);

    await expect(page.getByRole('button', { name: 'Cambiar' })).toBeVisible();
  });

  test('al cambiarla se avisa ANTES de que la anterior sigue funcionando', async ({ page }) => {
    // El dato que quita el miedo tiene que estar antes de pulsar, no después:
    // nadie con el QR ya impreso toca un botón que puede romperlo.
    const { cambios } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirEstudio(page);

    await page.getByRole('button', { name: 'Cambiar' }).click();
    await expect(page.getByText(/seguirá funcionando/i)).toBeVisible();

    const campo = page.getByRole('textbox', { name: 'Dirección de tu página de reservas' });
    await campo.fill('estudio Núñez');
    // Se enseña cómo va a quedar antes de guardar: nadie sabe qué es un slug.
    await expect(page.getByText('/reservar/estudio-nunez')).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar dirección' }).click();

    await expect.poll(() => cambios.length, { timeout: 15_000 }).toBe(1);
    expect(cambios[0], 'se manda ya normalizado').toMatchObject({ slug: 'estudio-nunez' });
  });

  test('una dirección imposible se explica mientras se escribe', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirEstudio(page);

    await page.getByRole('button', { name: 'Cambiar' }).click();
    const campo = page.getByRole('textbox', { name: 'Dirección de tu página de reservas' });
    const boton = page.getByRole('button', { name: 'Cambiar dirección' });
    // `role="alert"` lo usa también el anunciador de rutas de Next, que está
    // siempre presente y vacío: hay que acotar al aviso propio.
    const aviso = page.getByRole('alert').filter({ hasText: /./ });

    await campo.fill('ab');
    await expect(aviso).toContainText('al menos 3');
    await expect(boton, 'no se deja pulsar algo que el servidor va a rechazar').toBeDisabled();

    // «portal» es una ruta de la propia aplicación.
    await campo.fill('portal');
    await expect(aviso).toContainText('la usa la aplicación');
    await expect(boton).toBeDisabled();

    await campo.fill('mi-estudio');
    await expect(boton).toBeEnabled();
  });

  test('si el servidor la rechaza, se dice el motivo y no se pierde lo escrito', async ({ page }) => {
    await mockBackend(page, {
      fallaCambio: { status: 409, body: { error: 'Esa dirección ya está en uso por otro estudio. Prueba con otra.' } },
    });
    await seedSesionDeDuena(page);
    await abrirEstudio(page);

    await page.getByRole('button', { name: 'Cambiar' }).click();
    await page.getByRole('textbox', { name: 'Dirección de tu página de reservas' }).fill('pilates-centro');
    await page.getByRole('button', { name: 'Cambiar dirección' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText('ya está en uso');
    await expect(page.getByRole('textbox', { name: 'Dirección de tu página de reservas' }))
      .toHaveValue('pilates-centro');
  });
});
