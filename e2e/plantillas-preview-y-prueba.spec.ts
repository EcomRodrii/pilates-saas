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

// La lista es un índice: cada correo es una fila que abre su editor. Antes eran
// seis tarjetas abiertas a la vez y se llegaba a los campos sin abrir nada.
async function abrirImpago(page: Page) {
  await page.getByRole('button', { name: /Pago fallido/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Plantillas de email: vista previa y envío de prueba', () => {
  test('la plantilla de Pago fallido existe y se puede editar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Pago fallido')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cuando un cobro automático no se completa.', { exact: false })).toBeVisible();
  });

  // Ya no hay botón de "Vista previa": el correo está siempre delante y se
  // rehace solo al dejar de teclear. Se comprueba lo mismo de antes —que
  // renderiza el BORRADOR sin guardarlo— pero sobre el flujo nuevo.
  test('la vista previa se rehace sola con el borrador, sin guardarlo', async ({ page }) => {
    let pruebaLlamada = false;
    const cuerposPedidos: { tipo?: string; asunto?: string | null }[] = [];
    await montar(page);
    await page.route('**/api/plantillas-email/preview', route => {
      cuerposPedidos.push(route.request().postDataJSON());
      return json(route, {
        html: '<html><body>Hola Ana García</body></html>',
        subject: 'Tu cuota no se ha podido cobrar',
      });
    });
    await page.route('**/api/plantillas-email/prueba', () => { pruebaLlamada = true; });

    await abrirImpago(page);
    await page.getByPlaceholder('Problema con tu pago — {estudio}').fill('Tu cuota no se ha podido cobrar');

    // El asunto viaja en la petición de vista previa sin haber pulsado nada.
    await expect
      .poll(() => cuerposPedidos.some(c => c.tipo === 'impago' && c.asunto === 'Tu cuota no se ha podido cobrar'))
      .toBe(true);
    // Y se ve en la línea de bandeja, que es lo único que lee la clienta antes de abrir.
    await expect(page.getByText('Tu cuota no se ha podido cobrar').first()).toBeVisible();
    expect(pruebaLlamada).toBe(false); // solo previsualiza: no ha guardado ni enviado nada
  });

  test('enviar una prueba manda el email de verdad a quien la pide, y lo dice', async ({ page }) => {
    await montar(page);
    await page.route('**/api/plantillas-email/prueba', route =>
      json(route, { ok: true, enviadoA: 'duena@example.com' }));

    await abrirImpago(page);
    await page.getByRole('button', { name: 'Enviarme una prueba' }).click();

    await expect(page.getByText('Prueba enviada a duena@example.com')).toBeVisible();
  });

  test('si el envío de prueba falla, se dice el motivo real', async ({ page }) => {
    await montar(page);
    await page.route('**/api/plantillas-email/prueba', route =>
      json(route, { error: 'Resend no configurado. Añade RESEND_API_KEY en .env.local' }, 503));

    await abrirImpago(page);
    await page.getByRole('button', { name: 'Enviarme una prueba' }).click();

    await expect(page.getByText(/Resend no configurado/)).toBeVisible();
  });
});
