import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "No puedo asistir" — la instructora dispara desde su propio panel el mismo
// motor de sustituciones que antes solo se podía activar desde /sustituciones
// (bloqueado para su rol) o por el enlace público sin login. Aquí verificamos
// las dos entradas mobile-first: la tarjeta del calendario sobre su propia
// clase, y "Clases de hoy" en el dashboard.
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
  { id: 'ins-laura', studio_id: STUDIO_ID, nombre: 'Laura', activo: true, rol: 'INSTRUCTOR',
    color: '#222', auth_user_id: 'auth-e2e-otra', email: 'laura@example.com', telefono: null },
];

const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };

// La clase que SÍ es suya (hoy, para que salga en "Clases de hoy" del dashboard).
const HOY = new Date().toISOString().slice(0, 10);
const SESION_PROPIA = {
  id: 'ses-propia', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
  instructor_id: 'ins-marta', inicio: `${HOY}T18:00:00+00:00`, fin: `${HOY}T18:50:00+00:00`,
  aforo_maximo: 10, cancelada: false,
};
// La clase de una compañera: no debe ofrecerle "No puedo asistir" ni "Buscar sustituta".
const SESION_AJENA = {
  id: 'ses-ajena', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
  instructor_id: 'ins-laura', inicio: `${HOY}T10:00:00+00:00`, fin: `${HOY}T10:50:00+00:00`,
  aforo_maximo: 10, cancelada: false,
};

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

async function mockBackend(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION_PROPIA, SESION_AJENA]));
  await page.route('**/api/sustituciones', route => {
    if (route.request().method() === 'POST') return json(route, { ok: true, yaAvisada: false });
    return json(route, { error: 'No tienes permiso para esto' }, 403);
  });
}

test.describe('Instructora: "No puedo asistir"', () => {
  test('en su propia clase del calendario, ve "No puedo asistir" y no "Buscar sustituta"', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page);
    await page.goto('/calendario');

    // Abre su propia clase.
    await page.getByRole('button', { name: /Marta Sanz/i }).click({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /No puedo asistir/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Buscar sustituta/i })).toHaveCount(0);
  });

  test('confirmar la baja llama al motor y muestra el cierre sin más pasos', async ({ page }) => {
    const capturado: { valor: { sesionId?: string; motivo?: string } | null } = { valor: null };
    await mockBackend(page);
    await page.route('**/api/sustituciones', async route => {
      if (route.request().method() === 'POST') {
        capturado.valor = route.request().postDataJSON();
        return json(route, { ok: true, yaAvisada: false });
      }
      return json(route, { error: 'No tienes permiso para esto' }, 403);
    });
    await seedSesion(page);
    await page.goto('/calendario');

    await page.getByRole('button', { name: /Marta Sanz/i }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /No puedo asistir/i }).click();
    await page.getByLabel(/Motivo/i).fill('Tengo médico');
    await page.getByRole('button', { name: /Sí, no puedo dar esta clase/i }).click();

    // Cierre: sabe que ya está avisada, sin ranking ni gestión de candidatas.
    await expect(page.getByText('Avisado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/buscar quién cubra/i)).toBeVisible();
    expect(capturado.valor?.sesionId).toBe('ses-propia');
    expect(capturado.valor?.motivo).toBe('Tengo médico');
  });

  test('en "Clases de hoy" del dashboard también puede avisar sin ir al calendario', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page);
    await page.goto('/dashboard');

    // Expande la tarjeta de su propia clase de hoy y confirma la acción.
    await page.getByRole('button', { name: /Marta Sanz/i }).click({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /No puedo asistir/i })).toBeVisible({ timeout: 30_000 });
  });
});
