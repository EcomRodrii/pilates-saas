import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-19. "En Zoom aparece 'Falta configurar NEXT_PUBLIC_ZOOM_CLIENT_ID'. Yo
// llevo un estudio de pilates. Eso no es un mensaje para mí."
//
// Al barrer el repo no era una cadena suelta: eran CINCO sitios pidiéndole a la
// dueña que configurase variables de entorno del servidor. Y no solo no las
// entiende — no puede hacer nada, porque no son suyas: son nuestras.
//
// Este test barre las pantallas afectadas y falla si vuelve a colarse el nombre
// de una variable de entorno, un `.env.local` o una clave de API.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Lo que NUNCA debe ver una dueña de estudio en pantalla.
const JERGA = [
  /NEXT_PUBLIC_[A-Z_]+/,
  /STRIPE_[A-Z_]+/,
  /RESEND_API_KEY/,
  /SUPABASE_[A-Z_]+/,
  /\.env\.local/,
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
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
  // `configurado: false` = Stripe SIN configurar, que es cuando salía la jerga.
  await page.route('**/api/billing/status**', route =>
    json(route, { plan: 'BASE', subscriptionStatus: null, activo: false, configurado: false, esPropietaria: true, bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto(ruta);
}

/**
 * OJO: hay que esperar a que la pantalla esté REALMENTE pintada antes de barrer.
 * Las tarjetas de integraciones llegan por carga diferida, así que leer el body
 * nada más entrar daba un verde falso: barría una página todavía vacía. Se
 * espera a un ancla que existe tanto con el texto bueno como con una regresión.
 */
async function textoVisible(page: Page, ancla: RegExp): Promise<string> {
  await page.getByText(ancla).first().waitFor({ timeout: 30_000 });
  return page.locator('body').innerText();
}

test.describe('Nada de jerga técnica en pantalla', () => {
  test('Integraciones: las que no están listas se explican sin variables de entorno', async ({ page }) => {
    await montar(page, '/configuracion?tab=integraciones');
    await expect(page.getByText('Integraciones').first()).toBeVisible({ timeout: 30_000 });

    // 'Google Calendar' es el título de una tarjeta: está tanto si el mensaje es
    // el bueno como si alguien vuelve a colar el nombre de la variable.
    const texto = await textoVisible(page, /Google Calendar/);
    for (const patron of JERGA) {
      expect(texto, `se coló jerga técnica: ${patron}`).not.toMatch(patron);
    }

    // Y lo que sí ve: algo que entiende y que le dice de quién es el problema.
    await expect(page.getByText(/Lo estamos terminando de conectar por nuestro lado/).first()).toBeVisible();
  });

  test('Suscripción sin pagos configurados: le decimos qué hacer, no qué claves poner', async ({ page }) => {
    await montar(page, '/suscripcion');
    // Titulares nuevos desde el rediseño de la pantalla (apertura al público).
    await expect(page.getByText(/Elige tu plan|Tu suscripción|Tu prueba ha terminado/)).toBeVisible({ timeout: 30_000 });

    const texto = await textoVisible(page, /Elige tu plan|Tu suscripción|Tu prueba ha terminado/);
    for (const patron of JERGA) {
      expect(texto, `se coló jerga técnica: ${patron}`).not.toMatch(patron);
    }
    await expect(page.getByText(/estamos terminando de configurar los pagos/)).toBeVisible();
  });
});
