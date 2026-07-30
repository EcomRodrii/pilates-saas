import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cuarto tramo del autoservicio de instructora: puede ver/editar su propia
// disponibilidad desde /mi-perfil (panel logueado), sin depender del enlace
// público firmado. Solo su rol ve esta sección — el resto gestiona la
// disponibilidad de cualquiera desde /equipo, vedado a INSTRUCTOR.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_INSTRUCTORA = 'auth-e2e-instructora';
const UID_DUENA = 'auth-e2e-duena';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#F7A6C4', auth_user_id: UID_INSTRUCTORA, email: 'marta@example.com', telefono: null },
];

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

async function mockBackend(page: Page, opts: { celdas?: string[]; onGuardar?: (body: unknown) => void } = {}) {
  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro — el
  // genérico va PRIMERO para que los específicos (registrados después) ganen.
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
  await page.route('**/api/mi-disponibilidad', route => {
    if (route.request().method() === 'POST') {
      opts.onGuardar?.(route.request().postDataJSON());
      return json(route, { ok: true, guardadas: 1 });
    }
    return json(route, { celdas: opts.celdas ?? [] });
  });
}

test.describe('Instructora: su propia disponibilidad en /mi-perfil', () => {
  test('la instructora ve la rejilla de disponibilidad, la dueña no', async ({ page }) => {
    await mockBackend(page, { celdas: ['1-manana'] });
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/mi-perfil');

    await expect(page.getByText('Tu disponibilidad')).toBeVisible({ timeout: 30_000 });
  });

  test('la dueña no ve la sección de disponibilidad en su propio /mi-perfil', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_DUENA, 'cloe@example.com');
    await page.goto('/mi-perfil');

    await expect(page.getByText('Tu nombre, tu foto')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu disponibilidad')).toHaveCount(0);
  });

  test('marcar una franja y guardar manda las celdas correctas', async ({ page }) => {
    let guardado: any = null;
    await mockBackend(page, { celdas: [], onGuardar: b => { guardado = b; } });
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/mi-perfil');

    await expect(page.getByText('Tu disponibilidad')).toBeVisible({ timeout: 30_000 });
    // Lunes es la primera fila, Mañana la primera franja.
    const guardarBtn = page.getByRole('button', { name: 'Guardar', exact: true });
    await guardarBtn.scrollIntoViewIfNeeded();
    const celdas = page.locator('.grid button[aria-pressed]');
    await celdas.first().click();
    await guardarBtn.click();

    await expect.poll(() => guardado).not.toBeNull();
    expect(guardado.celdas).toEqual(['1-manana']);
  });
});
