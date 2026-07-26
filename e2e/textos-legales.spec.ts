import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Lo que firma la clienta tiene que decir quién eres."
//
// El texto por defecto decía «El responsable del tratamiento de sus datos es el
// estudio de pilates (en adelante, "el Estudio")» — sin nombre, sin NIF y sin
// domicilio, AUNQUE el estudio los tuviera rellenos en Configuración. El RGPD
// (art. 13.1.a) obliga a identificar al responsable: sin eso, la aceptación que
// se guarda con la firma no informa de nada.
//
// La cláusula de cancelación además estaba clavada en "12 horas" mientras
// `studios.cancelacion_ventana_horas` es configurable: el contrato decía una
// cosa y el software hacía otra.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

/** Estudio con los datos fiscales rellenos y ventana de cancelación de 24 h.
 *  `politica_privacidad`/`terminos_servicio` a null = "usa el texto por defecto",
 *  que es justo el que tiene que salir redactado con estos datos. */
const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Pilates Centro',
  slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID,
  razon_social: 'Pilates Cloe SL',
  nif: 'B67891234',
  direccion: 'Carrer de Balmes 145, 3r 1a',
  ciudad: 'Barcelona',
  codigo_postal: '08008',
  email: 'hola@pilatescentro.es',
  telefono: '933445566',
  moneda: 'EUR',
  cancelacion_ventana_horas: 24,
  politica_privacidad: null,
  terminos_servicio: null,
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

async function mockBackend(page: Page, studio: Record<string, unknown> = STUDIO_ROW) {
  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, studio));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

/** El bloque de texto legal del paso 2: política y términos van juntos en un
 *  único contenedor scrollable. */
function bloqueLegal(page: Page) {
  // Regex y no string: `getByText('...')` ignora mayúsculas y casaba también con
  // la etiqueta del campo y con el texto de la casilla de aceptación.
  return page.getByText(/POLÍTICA DE PRIVACIDAD/);
}

/** Abre "Nueva clienta" y avanza al paso 2 (Política y contrato). */
async function abrirPasoDeContrato(page: Page) {
  await page.goto('/clientas');
  await page.getByRole('button', { name: /Nueva clienta|Añadir primera clienta/ }).first().click({ timeout: 30_000 });
  // Por rol y no por placeholder: "Laura" casa también con "laura@email.com".
  // Nombre, apellidos y email son los tres obligatorios del paso 1.
  await page.getByRole('textbox', { name: 'Nombre' }).fill('María');
  await page.getByRole('textbox', { name: 'Apellidos' }).fill('Soler Puig');
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com');
  await page.getByRole('button', { name: /Siguiente — Contrato/ }).click();
}

test.describe('Textos legales con los datos del estudio', () => {
  test('la política que firma la clienta identifica al responsable', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirPasoDeContrato(page);

    const legal = bloqueLegal(page);
    await expect(legal).toContainText('Pilates Cloe SL');
    await expect(legal).toContainText('B67891234');
    await expect(legal).toContainText('Carrer de Balmes 145');
    await expect(legal).toContainText('08008 Barcelona');
    // Y ya no puede quedar la fórmula anónima.
    await expect(legal).not.toContainText('es el estudio de pilates');
  });

  test('el contrato usa la ventana de cancelación real, no un 12 fijo', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirPasoDeContrato(page);

    const legal = bloqueLegal(page);
    await expect(legal).toContainText('menos de 24 horas');
  });

  test('sin datos fiscales el documento lo dice, en vez de fingir', async ({ page }) => {
    await mockBackend(page, { ...STUDIO_ROW, razon_social: null, nif: null, nombre: null });
    await seedSesionDeDuena(page);
    await abrirPasoDeContrato(page);

    const legal = bloqueLegal(page);
    await expect(legal).toContainText('no ha completado sus datos fiscales');
  });
});
