import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Apagar un correo automático (Configuración → Emails).
//
// Petición literal de una propietaria: no quiere que salga la confirmación de
// reserva. Hasta ahora la pantalla dejaba REESCRIBIR los seis correos pero no
// callarlos: la única salida era vaciar los campos, que devuelve el texto de
// fábrica en vez de dejar de enviarlo.
//
// ⚠️ El interruptor NO es `activa`. Esa columna significa «ignora mi
// personalización y manda el correo de fábrica»; la nueva, `enviar`, significa
// «no lo mandes». Este spec fija justo eso: lo que se escribe al apagar es
// `enviar: false`, y `activa` no se toca. Confundirlas manda correos que la
// propietaria había apagado.
//
// Mismo enfoque que bajar-capacidad-de-sala.spec.ts: sesión de dueña sembrada
// en localStorage y backend interceptado, así que es determinista y no toca
// datos reales.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Studio Carmen',
  slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID,
  email: 'carmen@example.com',
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
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/** Devuelve lo que la app ha escrito en `plantillas_email`. */
async function mockBackend(page: Page, plantillas: Record<string, unknown>[] = []) {
  const escrituras: Record<string, unknown>[] = [];

  // Playwright resuelve las rutas en orden INVERSO: comodines primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route =>
    json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.route('**/rest/v1/plantillas_email**', async route => {
    const req = route.request();
    // El upsert de supabase-js es un POST con Prefer: resolution=merge-duplicates.
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const cuerpo = JSON.parse(req.postData() || '{}') as Record<string, unknown> | Record<string, unknown>[];
      escrituras.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
      return json(route, [], 201);
    }
    return json(route, plantillas);
  });

  return escrituras;
}

async function abrirEmails(page: Page) {
  await page.goto('/configuracion?tab=emails');
  await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
}

const APAGAR_RESERVA = 'Dejar de enviar «Reserva confirmada»';
const ENCENDER_RESERVA = 'Volver a enviar «Reserva confirmada»';

test('los seis correos nacen encendidos, y cada uno tiene su propio interruptor', async ({ page }) => {
  await seedSesionDeDuena(page);
  await mockBackend(page);
  await abrirEmails(page);

  // Sin fila en `plantillas_email` (el caso de todos los estudios de hoy) el
  // correo se envía: apagar tiene que ser siempre un acto explícito.
  await expect(page.getByRole('switch', { name: APAGAR_RESERVA })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch')).toHaveCount(6);
});

test('apagar la confirmación de reserva escribe `enviar: false` y NO toca `activa`', async ({ page }) => {
  await seedSesionDeDuena(page);
  const escrituras = await mockBackend(page);
  await abrirEmails(page);

  await page.getByRole('switch', { name: APAGAR_RESERVA }).click();

  // Se espera la escritura de verdad, no solo el repintado: un interruptor que
  // cambia de color sin llegar a la base de datos es exactamente el bug que
  // este repo ya se ha comido varias veces.
  await expect.poll(() => escrituras.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const fila = escrituras.find(e => e.tipo === 'reserva');
  expect(fila).toBeTruthy();
  expect(fila?.enviar).toBe(false);
  expect(fila?.activa).toBe(true);
  expect(fila?.studio_id).toBe(STUDIO_ID);
});

test('apagado, la lista dice qué deja de recibir la clienta', async ({ page }) => {
  await seedSesionDeDuena(page);
  await mockBackend(page, [{
    id: 'pl-1', studio_id: STUDIO_ID, tipo: 'reserva',
    asunto: null, intro: null, activa: true, enviar: false,
    cuerpo: null, boton_texto: null, color_cabecera: null, color_boton: null,
    logo_url: null, pie: null, fuente: null,
  }]);
  await abrirEmails(page);

  await expect(page.getByRole('switch', { name: ENCENDER_RESERVA })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Apagado')).toBeVisible();
  // La consecuencia ocupa el hueco del "cuándo se envía": con el correo
  // apagado, eso es lo que importa.
  await expect(page.getByText('Solo verá la confirmación en pantalla al reservar y en su portal.')).toBeVisible();
  await expect(page.getByText('Se envía cuando una clienta reserva una clase.')).toHaveCount(0);
});

test('el interruptor no abre de paso el editor', async ({ page }) => {
  await seedSesionDeDuena(page);
  await mockBackend(page);
  await abrirEmails(page);

  await page.getByRole('switch', { name: APAGAR_RESERVA }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Y el editor sí se abre por su sitio, avisando de que lo que se escriba ahí
  // no le va a llegar a nadie mientras siga apagado.
  await page.getByRole('button', { name: /Reserva confirmada/ }).click();
  await expect(page.getByRole('dialog').getByText('Ahora mismo este correo no se envía.')).toBeVisible();
});
