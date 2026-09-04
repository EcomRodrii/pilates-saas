import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase I (ver WHATSAPP_AUDIT.md): una conexión hecha por Embedded Signup
// (config.wabaId presente) tiene que abrir un modal de SOLO LECTURA, nunca el
// formulario de token/phoneId — ese formulario ya no recibe el token del
// servidor para estas filas (GET /api/integrations/config lo omite, ver Fase
// D), así que si el modal viejo se abriera igual, "Guardar" mandaría un
// token VACÍO y desconectaría en silencio un WhatsApp que funcionaba.
//
// Mismo andamiaje que e2e/credenciales-no-se-pierden.spec.ts (mismo bug de
// categoría: un modal que no distingue de dónde vino la credencial).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarIntegraciones(page: Page, opts: {
  config: Record<string, string>;
  contadorDesconexion?: { intentos: number };
}) {
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
  await page.route('**/rest/v1/integraciones**', route => {
    // El upsert de "Desconectar" también pasa por aquí (PATCH/POST) — cuenta
    // cualquier intento que no sea el GET inicial, siguiendo el mismo
    // criterio que test-4xx-necesita-contador-de-intentos: sin esto, un
    // "Desconectar" que no llega a mandar nada seguiría pasando el test.
    if (opts.contadorDesconexion && route.request().method() !== 'GET') {
      opts.contadorDesconexion.intentos += 1;
    }
    if (route.request().method() === 'GET') {
      return json(route, [{
        id: 'intg-whatsapp', studio_id: STUDIO_ID, tipo: 'WHATSAPP', activo: true,
        actualizado_en: '2026-08-01T10:00:00Z',
        ultimo_ok_en: '2026-08-27T10:00:00Z', ultimo_error: null, ultimo_error_en: null,
      }]);
    }
    return json(route, {});
  });
  // Registrada al final para ganar al comodín `**/api/**`.
  await page.route('**/api/integrations/config**', route => json(route, { config: opts.config }));

  await page.goto('/configuracion?tab=integraciones');
}

test.describe('WhatsApp conectado por Embedded Signup: modal de solo lectura', () => {
  test('con wabaId presente, el modal enseña el resumen — no el formulario de token', async ({ page }) => {
    await montarIntegraciones(page, {
      config: {
        wabaId: '123456789', phoneId: '987654321',
        verifiedName: 'Studio Carmen Pilates', displayPhoneNumber: '+34 611 222 333',
        // El token NUNCA llega aquí en la vida real (Fase D lo omite para
        // estas filas) — se deja fuera a propósito, ni el mock lo manda.
      },
    });
    await page.getByRole('button', { name: 'Gestionar' }).click({ timeout: 30_000 });

    await expect(page.getByText('Conectado a través de Meta')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Studio Carmen Pilates')).toBeVisible();
    await expect(page.getByText('+34 611 222 333')).toBeVisible();

    // Lo que NO debe existir: ni el campo de token, ni el botón que lo
    // guardaría vacío encima de una conexión que funciona.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
  });

  test('Desconectar manda de verdad la petición, no solo cambia el texto en pantalla', async ({ page }) => {
    const contador = { intentos: 0 };
    await montarIntegraciones(page, {
      config: { wabaId: '123456789', phoneId: '987654321', verifiedName: 'Studio Carmen', displayPhoneNumber: '+34 611 222 333' },
      contadorDesconexion: contador,
    });
    await page.getByRole('button', { name: 'Gestionar' }).click({ timeout: 30_000 });
    await expect(page.getByText('Conectado a través de Meta')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Desconectar' }).click();

    await expect.poll(() => contador.intentos, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('una fila SIN wabaId (flujo manual) sigue abriendo el formulario de siempre', async ({ page }) => {
    await montarIntegraciones(page, {
      config: { token: 'EL-TOKEN-BUENO', phoneId: '123456' },
    });
    await page.getByRole('button', { name: 'Gestionar' }).click({ timeout: 30_000 });

    // Sin `wabaId`, esto NO es una conexión de Embedded Signup — el resumen
    // de solo lectura no debe aparecer, y el formulario de siempre sí.
    await expect(page.getByText('Conectado a través de Meta')).toHaveCount(0);
    await expect(page.locator('input[value="EL-TOKEN-BUENO"]')).toBeVisible({ timeout: 15_000 });
  });
});
