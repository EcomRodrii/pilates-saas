import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El (i) junto al título de cada pantalla: que esté, que se abra y que su
// enlace lleve a algún sitio.
//
// Lo que este test protege de verdad no es que el icono exista —eso se ve— sino
// las dos formas en que esto se rompe en silencio:
//
//   1. El enlace del recuadro es lo único que saca a alguien de la pantalla, y
//      un href mal formado (categoría sin artículo, o al revés) da un 404 del
//      centro de ayuda a quien ya estaba perdido. Aquí se comprueba la URL
//      real, no que haya un <a>.
//   2. El icono lo resuelve PageHeader por la RUTA. Si esa resolución deja de
//      funcionar, el (i) desaparece de las veinte pantallas a la vez sin que
//      falle nada más: no hay excepción, no hay hueco visible, solo un panel
//      que vuelve a no explicarse.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.goto(ruta);
  await page.waitForSelector('[data-slot="page-header"]', { timeout: 30_000 });
}

// Una muestra de secciones, no las veinte: todas pasan por el mismo camino
// (PageHeader → ruta → ficha), así que repetirlo veinte veces solo alarga el CI.
const PANTALLAS = [
  { ruta: '/equipo', titulo: 'Equipo', guia: '/ayuda/instructores/dar-de-alta-una-instructora' },
  { ruta: '/informes', titulo: 'Informes', guia: '/ayuda/informes/informes-disponibles' },
  { ruta: '/sustituciones', titulo: 'Sustituciones', guia: '/ayuda/instructores/sustituciones' },
  { ruta: '/productos', titulo: 'Paquetes', guia: '/ayuda/bonos/tipos-de-bono' },
  // Sin artículo concreto: el enlace va a la categoría entera, y esa es
  // justo la forma que más fácil se rompe al escribir una ficha nueva.
  { ruta: '/cobros', titulo: 'Cobros', guia: '/ayuda/pagos' },
];

for (const { ruta, titulo, guia } of PANTALLAS) {
  test(`${ruta} explica qué es y enlaza su guía`, async ({ page }) => {
    await montar(page, ruta);

    const icono = page.getByRole('button', { name: `Qué es ${titulo}` });
    await expect(icono).toBeVisible();

    await icono.click();
    const recuadro = page.locator('[data-slot="ayuda-pantalla"]');
    await expect(recuadro).toBeVisible();
    await expect(recuadro).toContainText('Te quita de encima');

    const enlace = recuadro.getByRole('link', { name: /Ver la guía completa/ });
    await expect(enlace).toHaveAttribute('href', guia);
  });
}

test('se abre también al pasar el ratón por encima', async ({ page }) => {
  await montar(page, '/equipo');
  await page.getByRole('button', { name: 'Qué es Equipo' }).hover();
  await expect(page.locator('[data-slot="ayuda-pantalla"]')).toBeVisible();
});

test('una subpantalla de un flujo no pinta el icono', async ({ page }) => {
  await montar(page, '/clientas/importar');
  await expect(page.locator('[data-slot="ayuda-pantalla-trigger"]')).toHaveCount(0);
});
