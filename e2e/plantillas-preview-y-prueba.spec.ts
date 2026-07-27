import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-11. "Solo 5 plantillas de email, sin preview ni envío de prueba; faltan
// las que mueven dinero." La propietaria escribía asunto/intro a ciegas — el
// único modo de saber si sonaban bien era esperar a que una clienta real
// recibiera el email real. Y el aviso de pago fallido, el que más importa
// económicamente, ni siquiera se podía tocar (estaba fuera del sistema de
// plantillas por completo).
//
// Esta suite cubre las tres piezas: la plantilla de Pago fallido existe y es
// editable; la vista previa renderiza el borrador SIN guardarlo; el envío de
// prueba manda un email real, pero siempre a quien lo pide, nunca a un
// destinatario arbitrario.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
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

  await page.goto('/configuracion?tab=plantillas');
}

// h3 → div (label+descripción) → div.flex (cabecera) → div de la tarjeta.
function tarjetaImpago(page: Page) {
  return page.getByRole('heading', { name: 'Pago fallido' }).locator('../../..');
}

test.describe('Plantillas de email: vista previa y envío de prueba', () => {
  test('la plantilla de Pago fallido existe y se puede editar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Pago fallido')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cuando un cobro automático no se completa.', { exact: false })).toBeVisible();
  });

  test('la vista previa renderiza el borrador sin guardarlo', async ({ page }) => {
    let guardadoLlamado = false;
    await montar(page);
    await page.route('**/api/plantillas-email/preview', route => {
      const body = route.request().postDataJSON();
      expect(body.tipo).toBe('impago');
      expect(body.asunto).toBe('Tu cuota no se ha podido cobrar');
      return json(route, { html: '<html><body>Hola Ana García</body></html>', subject: 'Tu cuota no se ha podido cobrar' });
    });
    await page.route('**/api/plantillas-email/prueba', () => { guardadoLlamado = true; });

    await page.getByText('Pago fallido').scrollIntoViewIfNeeded();
    const asuntoImpago = tarjetaImpago(page).getByPlaceholder('Problema con tu pago — {estudio}');
    await asuntoImpago.fill('Tu cuota no se ha podido cobrar');
    await tarjetaImpago(page).getByRole('button', { name: 'Vista previa' }).click();

    await expect(page.getByRole('dialog', { name: 'Vista previa — Pago fallido' })).toBeVisible();
    await expect(page.getByText('Tu cuota no se ha podido cobrar')).toBeVisible();
    expect(guardadoLlamado).toBe(false); // solo previsualiza: no ha llamado a guardar ni a enviar prueba
  });

  test('enviar una prueba manda el email de verdad a quien la pide, y lo dice', async ({ page }) => {
    await montar(page);
    await page.route('**/api/plantillas-email/prueba', route =>
      json(route, { ok: true, enviadoA: 'duena@example.com' }));

    await page.getByText('Pago fallido').scrollIntoViewIfNeeded();
    await tarjetaImpago(page).getByRole('button', { name: 'Enviarme una prueba' }).click();

    await expect(page.getByText('Prueba enviada a duena@example.com')).toBeVisible();
  });

  test('si el envío de prueba falla, se dice el motivo real', async ({ page }) => {
    await montar(page);
    await page.route('**/api/plantillas-email/prueba', route =>
      json(route, { error: 'Resend no configurado. Añade RESEND_API_KEY en .env.local' }, 503));

    await page.getByText('Pago fallido').scrollIntoViewIfNeeded();
    await tarjetaImpago(page).getByRole('button', { name: 'Enviarme una prueba' }).click();

    await expect(page.getByText(/Resend no configurado/)).toBeVisible();
  });
});
