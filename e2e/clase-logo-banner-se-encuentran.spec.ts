import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «No se puede agregar ni banner ni logo».
//
// Sí se podía: los dos controles existen y la subida funciona (la política de
// Storage tiene su rama `claselogo-`). Lo que no se podía era ENCONTRARLOS.
// Vivían dentro de una sección plegada titulada «Cómo la encuentran tus
// alumnas», cuyo resumen —la única pista de lo que hay dentro cuando está
// cerrada— hablaba de objetivos y descripción, sin mencionar ninguna imagen.
//
// Y justo encima, la previsualización «Así la verá tu alumna» enseñaba el hueco
// del logo y el banner sin ofrecer ninguna forma de tocarlos. La pantalla
// prometía algo y escondía la única vía de hacerlo.
//
// Mismo patrón que los tres recortes del calendario: el control existe, el DOM
// lo da por presente, y para la persona que mira no está.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

const TIPO = {
  id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Mat + Circuito', color: '#E8D5C2',
  duracion_minutos: 50, descripcion: null, nivel: 'MEDIO',
  foto_url: null, logo_url: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function abrirEditarClase(page: Page) {
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
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO]));

  await page.goto('/configuracion?tab=clases');
  await page.getByRole('button', { name: 'Editar' }).first().click({ timeout: 30_000 });
  await expect(page.getByText('Así la verá tu alumna')).toBeVisible({ timeout: 15_000 });
}

test('la sección plegada dice si la clase tiene logo y banner', async ({ page }) => {
  await abrirEditarClase(page);
  // Con la sección cerrada, su resumen es lo único que se lee. Antes decía
  // «Se ofrece para todos los objetivos» y nada más.
  await expect(page.getByText('sin logo ni banner')).toBeVisible();
});

test('desde la previsualización se llega a subir logo y banner', async ({ page }) => {
  await abrirEditarClase(page);

  // Los controles NO están a la vista al abrir el panel: ese era el reporte.
  await expect(page.getByRole('button', { name: 'Subir logo' })).toBeHidden();

  await page.getByRole('button', { name: 'Poner logo y banner' }).click();

  await expect(page.getByRole('button', { name: 'Subir logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subir banner' })).toBeVisible();
});
