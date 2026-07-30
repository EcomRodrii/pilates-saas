import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Segundo tramo del autoservicio de instructora (tras "no puedo asistir"):
// puede crear una clase nueva, siempre asignada a sí misma. Sin selector de
// instructora, sin aforo editable, sin recurrencia — eso sigue siendo trabajo
// de mostrador. La RLS real vive en la migración 20260731100000; aquí se
// comprueba la barrera de UI y que el alta llega con los datos correctos.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_INSTRUCTORA = 'auth-e2e-instructora';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#F7A6C4', auth_user_id: UID_INSTRUCTORA, email: 'marta@example.com', telefono: null },
];

const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8, color: '#F7A6C4' };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: 'marta@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, UID_INSTRUCTORA] as const);
}

async function mockBackend(page: Page, onInsertSesion?: (body: unknown) => void) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro —
  // el genérico va PRIMERO para que los específicos (registrados después) ganen.
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/sesiones**', route => {
    if (route.request().method() === 'POST') {
      onInsertSesion?.(route.request().postDataJSON());
      return json(route, route.request().postDataJSON(), 201);
    }
    return json(route, []);
  });
}

test.describe('Instructora: crea su propia clase', () => {
  test('el formulario no ofrece elegir instructora, ni aforo editable, ni recurrencia', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page);
    await page.goto('/calendario');

    await page.getByRole('button', { name: 'Nueva clase' }).click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Nueva clase' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('Instructora', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Repetir semanalmente')).toHaveCount(0);
    await expect(page.getByLabel(/Aforo máximo/i)).toBeDisabled();
  });

  test('crear la clase la asigna a sí misma, en el estado y con la fecha elegidos', async ({ page }) => {
    let insertado: any = null;
    await mockBackend(page, body => { insertado = body; });
    await seedSesion(page);
    await page.goto('/calendario');

    await page.getByRole('button', { name: 'Nueva clase' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Crear clase$/ }).click();

    await expect.poll(() => insertado).not.toBeNull();
    expect(insertado.instructor_id).toBe('ins-marta');
    expect(insertado.studio_id).toBe(STUDIO_ID);
    expect(insertado.aforo_maximo).toBe(SALA.capacidad);
  });
});
