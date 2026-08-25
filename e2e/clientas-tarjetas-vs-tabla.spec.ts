import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de cliente: en /clientas, "Total clientas" decía 2 con 3 filas en
// la tabla ("Mostrando 3 de 3"), y "Con bono vigente" decía 1 con 2 filas de
// bono visibles. Causa: stats_clientas() (migr 20260731004515) excluye a
// propósito los LEAD/INTERESADA del conteo, pero la tabla los seguía
// mostrando por defecto — cada una contaba con una regla distinta sin que la
// pantalla lo explicara. Fix: la tabla aplica el mismo criterio por defecto;
// verlas es la vía explícita de elegir esa etapa en el filtro.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const CLIENTA_ACTIVA = {
  id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com',
  telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [], lead_stage: 'ACTIVA',
};
const CLIENTA_LEAD = {
  id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'Soto', email: 'bea@example.com',
  telefono: null, activo: true, fecha_alta: '2026-02-01', campos_extra: {}, tags: [], lead_stage: 'LEAD',
};

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
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Una LEAD con bono activo: stats_clientas() la excluye a propósito
  // (mismo criterio que aquí abajo se espera de la tabla).
  await page.route('**/rest/v1/rpc/stats_clientas', route =>
    json(route, [{ total: 1, activas: 1, con_bono: 1, inactivas_30d: 0 }]));
  await page.route('**/rest/v1/socios**', route => json(route, [CLIENTA_ACTIVA, CLIENTA_LEAD]));

  await page.goto('/clientas');
  await page.getByText('Total clientas').waitFor({ timeout: 30_000 });
}

test.describe('Clientas: la tarjeta y la tabla cuentan lo mismo', () => {
  test('por defecto, la tabla excluye los LEAD/INTERESADA igual que las tarjetas', async ({ page }) => {
    await montar(page);

    await expect(page.getByText('Total clientas')).toBeVisible();
    // La tarjeta dice 1 (excluye a la LEAD) — la tabla, por defecto, debe
    // mostrar exactamente esa misma clienta, no las 2 filas que existen.
    await expect(page.getByText('Mostrando 1 de 1')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ana Ruiz')).toBeVisible();
    await expect(page.getByText('Bea Soto')).toHaveCount(0);
  });

  test('elegir la etapa "Lead" a propósito sí la muestra', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Mostrando 1 de 1')).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Filtrar por etapa del embudo').selectOption('LEAD');

    await expect(page.getByText('Bea Soto')).toBeVisible();
    await expect(page.getByText('Ana Ruiz')).toHaveCount(0);
  });
});
