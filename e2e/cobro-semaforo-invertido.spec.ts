import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Aprobar y cobrar" contaba lo CONTRARIO de lo que había pasado.
//
// El servidor distingue dos desenlaces cuando Stripe dice que sí:
//   200 → recibo COBRADO, renovación aplicada, factura sellada. Cerrado.
//   202 + `aviso: 'COBRADO_SIN_PERSISTIR'` → el dinero entró pero no se pudo
//        dejar escrito; no hay renovación ni factura y alguien tiene que mirarlo.
//
// La pantalla no leía ese aviso —202 entra en `res.ok`, así que el cliente lo
// devolvía como un `{ok:true}` pelado— y deducía el desenlace llamando a
// `marcarCobrado`. Eso da la respuesta al revés: en el camino bueno el recibo YA
// estaba COBRADO, el compare-and-set sobre PENDIENTE tocaba 0 filas y la UI
// avisaba de un problema inexistente EN CADA COBRO CORRECTO; en el camino malo
// el recibo seguía PENDIENTE, el UPDATE encajaba, y se anunciaba éxito
// precisamente en el único caso que exigía intervención.
//
// ⚠️ Esto NO lo puede cazar la suite por la vía normal: `page.route` mockea la
// red, así que ningún test ve un 202 a menos que se fabrique a mano, que es
// justo lo que hace este fichero.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-06';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Un log a la espera de que alguien apruebe el cobro con la tarjeta guardada. */
const LOG_PENDIENTE = {
  id: 'log-cobro', studio_id: STUDIO_ID, rule_id: null, rule_name: 'Pago pendiente',
  socio_id: 's1', socio_nombre: 'Ana Ruiz', paso_index: 0, accion: 'COBRAR_RECIBO',
  resultado: 'PENDIENTE_ADMIN', detalle: null, mensaje_cliente: null,
  ejecutado_en: `${HOY}T09:00:00+00:00`, proxima_accion_en: null,
  recibo_id: 'rec-1', automatizacion_id: null,
};

/**
 * Monta `/automatizaciones` con sesión de dueña y un cobro pendiente de
 * aprobar. `respuestaCobro` es lo que devolverá `/api/stripe/charge-off-session`.
 */
async function montar(page: Page, respuestaCobro: { status: number; body: unknown }) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));

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
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/automation_logs**', route => json(route, [LOG_PENDIENTE]));

  // ⚠️ AL FINAL a propósito: en Playwright gana la ruta registrada MÁS TARDE,
  // así que si esta va antes, el `**/api/**` genérico de arriba se la come y
  // devuelve `{}` con 200 — con lo que el test del 202 nunca vería un 202 y el
  // del 200 pasaría por el motivo equivocado. Pasó al escribir este fichero.
  await page.route('**/api/stripe/charge-off-session', route =>
    json(route, respuestaCobro.body, respuestaCobro.status));

  await page.goto('/automatizaciones');
  await expect(page.getByRole('button', { name: /Aprobar y cobrar/i })).toBeVisible({ timeout: 30_000 });
}

test.describe('El semáforo de "Aprobar y cobrar" dice lo que ha pasado de verdad', () => {
  test('cobro correcto (200): NO se avisa de ningún problema', async ({ page }) => {
    // Antes salía "el recibo NO se ha podido marcar como cobrado… compruébalo
    // antes de volver a cobrarlo" en CADA cobro que iba bien.
    await montar(page, { status: 200, body: { ok: true, status: 'succeeded' } });

    await page.getByRole('button', { name: /Aprobar y cobrar/i }).click();

    await expect(page.getByText(/aprobado y ejecutado con la tarjeta guardada/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/NO se ha podido marcar/i)).toHaveCount(0);
    await expect(page.getByText(/antes de volver a cobrarlo/i)).toHaveCount(0);
  });

  test('cobrado sin persistir (202): se avisa, y NO se llama éxito', async ({ page }) => {
    // El único caso que exige que alguien mire, y era el que salía en verde.
    await montar(page, {
      status: 202,
      body: {
        ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR',
        error: 'El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.',
      },
    });

    await page.getByRole('button', { name: /Aprobar y cobrar/i }).click();

    await expect(page.getByText(/no se pudo marcar el recibo como COBRADO/i)).toBeVisible({ timeout: 15_000 });
    // Y sobre todo: que no se lea como un cobro cerrado.
    await expect(page.getByText(/aprobado y ejecutado con la tarjeta guardada/i)).toHaveCount(0);
  });
});
