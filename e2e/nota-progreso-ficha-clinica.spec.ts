import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La "Nota de sesión IA" (progreso/alertas de una socia, tabla notas_progreso)
// vivía en el resumen general de la ficha, visible a CUALQUIER rol — incluida
// RECEPCIÓN, que según FICHA-CLINICA.md §11 no debe ver el detalle clínico
// (solo el semáforo). Ahora está detrás de `verFichaClinica` (PROPIETARIO/
// INSTRUCTOR). La RLS real (`salud_notas_progreso`, migración 0095) ya estaba
// correcta — esto cierra el hueco de UI que quedaba abierto encima de ella.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_RECEPCION = 'auth-e2e-recepcion';
const UID_INSTRUCTORA = 'auth-e2e-instructora';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-sara', studio_id: STUDIO_ID, nombre: 'Sara Recepcion', activo: true, rol: 'RECEPCION',
    color: '#F7A6C4', auth_user_id: UID_RECEPCION, email: 'sara@example.com', telefono: null },
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#222', auth_user_id: UID_INSTRUCTORA, email: 'marta@example.com', telefono: null },
];

const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {},
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: mail, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

async function mockBackend(page: Page) {
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
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
}

test.describe('Nota de sesión IA: detrás de la ficha clínica', () => {
  test('recepción no ve la nota de sesión IA en la ficha de una socia', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_RECEPCION, 'sara@example.com');
    await page.goto('/clientas/soc-1');

    await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nota de sesión IA')).toHaveCount(0);
  });

  test('la instructora sí ve la nota de sesión IA en la ficha de una socia', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/clientas/soc-1');

    await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nota de sesión IA')).toBeVisible();
  });
});
