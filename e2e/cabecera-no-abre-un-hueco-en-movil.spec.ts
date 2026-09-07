import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La cabecera abría 256 px de hueco en blanco en TODAS las pantallas del panel,
// en móvil.
//
// Lo metí yo: para que una barra de acciones ancha no aplastara el título en
// escritorio, la columna del título llevaba `basis-64`… SIN prefijo. Debajo de
// `sm` la cabecera es `flex-col`, y ahí `flex-basis` mide el eje VERTICAL: 16rem
// de ALTO. Medido antes del arreglo: 256 px de columna de título en /cobros,
// /clientas y /calendario, con el contenido empujado fuera de la primera
// pantalla y la rejilla del mes aplastada.
//
// Este test mide el alto real. Un test que solo mirara que el título existe
// pasaba con el hueco delante.
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

/**
 * Alto de la columna del título: el HIJO DIRECTO de la cabecera que contiene el
 * <h1> — que es exactamente el que llevaba el `basis-64` sin prefijo.
 *
 * ⚠️ Se busca por `parentElement` hasta la cabecera y no con un `closest` a
 * ojo: el título va envuelto en dos divs (uno para la insignia, otro para la
 * columna), así que subir un nivel fijo mide el div de dentro —que nunca tuvo
 * el bug— y el test pasaba con la regresión delante. Pasó en el primer intento.
 */
async function altoColumnaTitulo(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cabecera = document.querySelector('[data-slot="page-header"]');
    let nodo = document.querySelector('[data-slot="page-header-title"]') as HTMLElement | null;
    while (nodo && nodo.parentElement !== cabecera) nodo = nodo.parentElement;
    return nodo ? Math.round(nodo.getBoundingClientRect().height) : -1;
  });
}

for (const ruta of ['/cobros', '/clientas', '/calendario']) {
  test(`en móvil, la cabecera de ${ruta} no abre un hueco de 16rem`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await montar(page, ruta);

    const alto = await altoColumnaTitulo(page);
    // Un título + subtítulo caben de sobra en 160 px. El bug daba exactamente
    // 256 (16rem), así que cualquier tope entre medias lo caza; 160 deja
    // margen para un título que ocupe dos líneas en una pantalla estrecha.
    expect(alto, `la columna del título mide ${alto}px en ${ruta}`).toBeGreaterThan(0);
    expect(alto, `la columna del título mide ${alto}px en ${ruta} — el bug daba 256`).toBeLessThan(160);
  });
}

test('en escritorio la cabecera sigue en una línea', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await montar(page, '/cobros');
  const alto = await altoColumnaTitulo(page);
  expect(alto).toBeLessThan(120);
});
