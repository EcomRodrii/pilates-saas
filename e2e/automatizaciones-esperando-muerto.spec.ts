import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-4. El briefing de automatizaciones enseñaba "N esperando respuesta"
// contando logs con resultado 'ESPERANDO' — un estado que ningún camino de
// ejecución escribe jamás (automation-engine.ts lo documenta: las
// automatizaciones son de disparo único, no esperan respuesta de nadie). El
// contador marcaba SIEMPRE 0, sin decir nada real.
//
// Ahora esa casilla cuenta 'FALLIDO' (un email sin destinatario, WhatsApp sin
// configurar…), que sí ocurre de verdad y sí necesita un vistazo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-05';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function logRow(id: string, resultado: string, ejecutadoEn: string) {
  return {
    id, studio_id: STUDIO_ID, rule_id: null, rule_name: 'Aviso de cobro pendiente',
    socio_id: null, socio_nombre: null, paso_index: 0, accion: 'ENVIAR_EMAIL',
    resultado, detalle: null, mensaje_cliente: null,
    ejecutado_en: ejecutadoEn, proxima_accion_en: null, recibo_id: null, automatizacion_id: null,
  };
}

async function montar(page: Page, logs: Record<string, unknown>[]) {
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
  await page.route('**/rest/v1/automation_logs**', route => json(route, logs));

  await page.goto('/automatizaciones');
}

test.describe('El briefing de automatizaciones ya no cuenta un estado muerto', () => {
  test('"Esperando resp." no aparece en ningún sitio de la página', async ({ page }) => {
    await montar(page, [logRow('log-1', 'EJECUTADO', `${HOY}T09:00:00+00:00`)]);

    await expect(page.getByText('Acciones hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Esperando resp.')).toHaveCount(0);
    await expect(page.getByText(/esperando respuesta/i)).toHaveCount(0);
  });

  test('en su lugar cuenta "Fallidas hoy", que sí ocurre de verdad', async ({ page }) => {
    await montar(page, [
      logRow('log-1', 'EJECUTADO', `${HOY}T09:00:00+00:00`),
      logRow('log-2', 'FALLIDO', `${HOY}T10:00:00+00:00`),
      logRow('log-3', 'FALLIDO', `${HOY}T11:00:00+00:00`),
      // De ayer: no debe sumar al día de hoy.
      logRow('log-4', 'FALLIDO', '2026-08-04T09:00:00+00:00'),
    ]);

    await expect(page.getByText('Fallidas hoy')).toBeVisible({ timeout: 30_000 });
    const tile = page.getByText('Fallidas hoy').locator('..');
    await expect(tile.getByText('2', { exact: true })).toBeVisible();
  });
});
