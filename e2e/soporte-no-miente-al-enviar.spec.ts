import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El widget de ayuda decía «Enviado. ¡Gracias!» PASARA LO QUE PASARA.
//
// Dos fallos independientes, y ninguno se veía:
//  · `dbInsertSoporteSolicitud` se tragaba su error y devolvía void, así que la
//    pantalla no tenía forma de saber si el registro había entrado;
//  · `fetch` NO lanza con un 4xx/5xx —solo con la red caída—, así que el
//    `catch` de al lado no veía ni un 502 de Resend ni un 429 del rate-limit.
//
// Resultado: alguien escribiendo «no me funciona el cobro» se quedaba
// convencido de que le habíamos leído, y aquí no había llegado nada. Es el peor
// sitio del panel para mentir, porque quien escribe ya está atascado.
//
// La regla nueva: basta con que UNA de las dos vías llegue (el registro en BD y
// el correo son dos formas de enterarnos, no una cadena). Si fallan las dos, se
// dice y NO se borra lo escrito.
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

/** `soporte` decide qué contesta el endpoint del correo; `guardaEnBd`, la tabla. */
async function montar(page: Page, opciones: { soporte: number | 'ok'; guardaEnBd: boolean }) {
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

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/soporte_solicitudes**', route =>
    opciones.guardaEnBd
      ? json(route, [], 201)
      : json(route, { message: 'permission denied for table soporte_solicitudes' }, 403));
  await page.route('**/api/soporte**', route =>
    opciones.soporte === 'ok'
      ? json(route, { ok: true })
      : json(route, { error: 'No se ha podido enviar' }, opciones.soporte));

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
  await page.getByRole('button', { name: 'Preguntas frecuentes' }).click();
  await page.getByPlaceholder('Escribe aquí...').fill('No me funciona el cobro de septiembre');
}

test('si no llega por ninguna vía, lo dice — y no borra lo escrito', async ({ page }) => {
  await montar(page, { soporte: 502, guardaEnBd: false });

  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByText('No hemos podido enviar tu mensaje')).toBeVisible();
  // Lo que costaría volver a teclear sigue ahí.
  await expect(page.getByPlaceholder('Escribe aquí...')).toHaveValue('No me funciona el cobro de septiembre');
  await expect(page.getByText('Enviado. ¡Gracias!')).toHaveCount(0);
  // Y el botón invita a reintentar en vez de a pulsar otra vez a ciegas.
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('con el correo caído pero el registro guardado, SÍ ha llegado', async ({ page }) => {
  // Son dos formas de enterarnos, no una cadena: si la solicitud queda en la
  // tabla, la hemos recibido aunque Resend esté caído.
  await montar(page, { soporte: 502, guardaEnBd: true });

  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByText('Enviado. ¡Gracias!')).toBeVisible();
  await expect(page.getByText('No hemos podido enviar tu mensaje')).toHaveCount(0);
});

test('el camino normal sigue diciendo que sí', async ({ page }) => {
  await montar(page, { soporte: 'ok', guardaEnBd: true });

  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByText('Enviado. ¡Gracias!')).toBeVisible();
});
